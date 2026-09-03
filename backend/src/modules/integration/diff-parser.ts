export interface ParsedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  addedLines: number;
  deletedLines: number;
  patch: string;
  isBinary: boolean;
}

function normalize(path: string) {
  return path.trim().replace(/^[ab]\//, '');
}
export function decodeDiff(content?: string | null) {
  return content ? Buffer.from(content, 'base64').toString('utf8') : '';
}

export function parseDiff(diff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  let file: ParsedFile | null = null;
  const flush = () => {
    if (file) {
      file.patch = file.patch.trim();
      files.push(file);
    }
  };
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      flush();
      file = {
        path: normalize(line.split(/\s+/)[3] ?? 'unknown'),
        status: 'modified',
        addedLines: 0,
        deletedLines: 0,
        patch: line,
        isBinary: false,
      };
      continue;
    }
    if (!file) continue;
    file.patch += '\n' + line;
    if (line.startsWith('new file mode')) file.status = 'added';
    else if (line.startsWith('deleted file mode')) file.status = 'deleted';
    else if (line.startsWith('rename from')) file.status = 'renamed';
    else if (line.startsWith('rename to')) file.path = line.slice(10).trim();
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch'))
      file.isBinary = true;
    if (line.startsWith('+++ ') && line.slice(4).trim() !== '/dev/null')
      file.path = normalize(line.slice(4));
    else if (line.startsWith('--- ') && file.status === 'deleted')
      file.path = normalize(line.slice(4));
    if (!file.isBinary && line.startsWith('+') && !line.startsWith('+++'))
      file.addedLines++;
    if (!file.isBinary && line.startsWith('-') && !line.startsWith('---'))
      file.deletedLines++;
  }
  flush();
  return files;
}
