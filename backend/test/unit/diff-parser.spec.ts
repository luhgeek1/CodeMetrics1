import {
  decodeDiff,
  parseDiff,
} from '../../src/modules/integration/diff-parser.js';

describe('Git diff parsing', () => {
  it('handles added, deleted, renamed and binary files without counting headers', () => {
    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
-old
diff --git a/from.ts b/to.ts
rename from from.ts
rename to to.ts
diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;
    const files = parseDiff(decodeDiff(Buffer.from(diff).toString('base64')));
    expect(
      files.map((file) => [
        file.path,
        file.status,
        file.addedLines,
        file.deletedLines,
        file.isBinary,
      ]),
    ).toEqual([
      ['new.ts', 'added', 2, 0, false],
      ['old.ts', 'deleted', 0, 1, false],
      ['to.ts', 'renamed', 0, 0, false],
      ['image.png', 'modified', 0, 0, true],
    ]);
    expect(parseDiff('')).toEqual([]);
  });
});
