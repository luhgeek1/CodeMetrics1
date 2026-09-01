--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: size_bucket; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.size_bucket AS ENUM (
    'ZERO_TEN',
    'ELEVEN_FIFTY',
    'FIFTY_ONE_HUNDRED',
    'HUNDRED_PLUS'
);




--
-- Name: agg_author_repo_day; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agg_author_repo_day (
    day date NOT NULL,
    project_id integer NOT NULL,
    repo_id uuid NOT NULL,
    author_id uuid NOT NULL,
    commits integer NOT NULL,
    lines_added integer NOT NULL,
    lines_deleted integer NOT NULL,
    files_changed integer NOT NULL,
    msg_total_len integer NOT NULL,
    msg_short_count integer NOT NULL
);


--
-- Name: agg_file_repo_day; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agg_file_repo_day (
    day date NOT NULL,
    project_id integer NOT NULL,
    repo_id uuid NOT NULL,
    path text NOT NULL,
    commits_touch integer NOT NULL,
    lines_added integer NOT NULL,
    lines_deleted integer NOT NULL,
    churn integer NOT NULL
);


--
-- Name: COLUMN agg_file_repo_day.churn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agg_file_repo_day.churn IS 'added+deleted';


--
-- Name: agg_hour_repo_day; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agg_hour_repo_day (
    day date NOT NULL,
    project_id integer NOT NULL,
    repo_id uuid NOT NULL,
    hour smallint NOT NULL,
    commits integer NOT NULL,
    lines_added integer NOT NULL,
    lines_deleted integer NOT NULL,
    CONSTRAINT ck_agg_hour_valid_range CHECK (((hour >= 0) AND (hour < 24)))
);


--
-- Name: COLUMN agg_hour_repo_day.hour; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agg_hour_repo_day.hour IS 'Hour of the day (0-23)';


--
-- Name: agg_size_bucket_repo_day; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agg_size_bucket_repo_day (
    day date NOT NULL,
    project_id integer NOT NULL,
    repo_id uuid NOT NULL,
    bucket public.size_bucket NOT NULL,
    cnt integer NOT NULL
);


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authors (
    id uuid NOT NULL,
    git_name character varying NOT NULL,
    git_email character varying NOT NULL,
    email_normalized character varying NOT NULL,
    first_commit_at timestamp with time zone,
    last_commit_at timestamp with time zone
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid NOT NULL,
    repo_id uuid NOT NULL,
    name character varying NOT NULL,
    is_default boolean NOT NULL,
    is_protected boolean NOT NULL,
    updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: commit_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commit_files (
    change_id uuid NOT NULL,
    commit_sha character varying NOT NULL,
    file_path text NOT NULL,
    added_lines integer NOT NULL,
    deleted_lines integer NOT NULL,
    status character varying NOT NULL,
    patch text,
    is_binary boolean NOT NULL
);


--
-- Name: commits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commits (
    sha character varying NOT NULL,
    repo_id uuid NOT NULL,
    author_id uuid,
    committer_id uuid,
    message text NOT NULL,
    branch_names character varying[] NOT NULL,
    tag_names character varying[] NOT NULL,
    added_lines integer NOT NULL,
    deleted_lines integer NOT NULL,
    is_merge_commit boolean NOT NULL,
    diff_content text,
    created_at timestamp with time zone NOT NULL,
    committed_at timestamp with time zone,
    author_name character varying NOT NULL,
    author_email character varying NOT NULL,
    committer_name character varying,
    committer_email character varying,
    issues jsonb NOT NULL,
    parents character varying[] NOT NULL,
    old_tag_names character varying[] NOT NULL
);


--
-- Name: languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.languages (
    code character varying(2) NOT NULL,
    name_ru character varying NOT NULL,
    name_en character varying NOT NULL
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid NOT NULL,
    slug character varying(128) NOT NULL,
    name character varying(128) NOT NULL,
    description text,
    updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    name character varying NOT NULL,
    full_name text NOT NULL,
    description text,
    parent_id integer,
    permissions jsonb NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    is_public boolean DEFAULT false NOT NULL,
    lfs_allow boolean DEFAULT false NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN projects.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.id IS 'Matches swagger Project.id';


--
-- Name: COLUMN projects.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.name IS 'Project key, surfaced as swagger Project.name';


--
-- Name: COLUMN projects.permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.permissions IS 'Holds swagger permissions payload';


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: repositories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repositories (
    id uuid NOT NULL,
    project_id integer NOT NULL,
    name character varying NOT NULL,
    topics character varying[] NOT NULL,
    description text,
    default_branch character varying,
    permissions jsonb NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid NOT NULL,
    slug character varying(64) NOT NULL,
    name character varying(128) NOT NULL,
    description text,
    updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email character varying NOT NULL,
    password_hash text NOT NULL,
    confirmed_at timestamp with time zone,
    username character varying,
    profile_pic_url character varying,
    bio character varying,
    birth_date date,
    language_code character varying(2),
    is_onboarded boolean NOT NULL,
    banned boolean NOT NULL,
    updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_version integer DEFAULT 1 NOT NULL
);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: agg_author_repo_day agg_author_repo_day_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_author_repo_day
    ADD CONSTRAINT agg_author_repo_day_pkey PRIMARY KEY (day, repo_id, author_id);


--
-- Name: agg_file_repo_day agg_file_repo_day_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_file_repo_day
    ADD CONSTRAINT agg_file_repo_day_pkey PRIMARY KEY (day, repo_id, path);


--
-- Name: agg_hour_repo_day agg_hour_repo_day_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_hour_repo_day
    ADD CONSTRAINT agg_hour_repo_day_pkey PRIMARY KEY (day, repo_id, hour);


--
-- Name: agg_size_bucket_repo_day agg_size_bucket_repo_day_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_size_bucket_repo_day
    ADD CONSTRAINT agg_size_bucket_repo_day_pkey PRIMARY KEY (day, repo_id, bucket);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: authors authors_email_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_email_normalized_key UNIQUE (email_normalized);


--
-- Name: authors authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: commit_files commit_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commit_files
    ADD CONSTRAINT commit_files_pkey PRIMARY KEY (change_id);


--
-- Name: commits commits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_pkey PRIMARY KEY (sha);


--
-- Name: languages languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.languages
    ADD CONSTRAINT languages_pkey PRIMARY KEY (code);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_slug_key UNIQUE (slug);


--
-- Name: projects projects_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_name_key UNIQUE (name);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: repositories repositories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_slug_key UNIQUE (slug);


--
-- Name: branches uq_branch_repo_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT uq_branch_repo_name UNIQUE (repo_id, name);


--
-- Name: repositories uq_repository_project_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT uq_repository_project_name UNIQUE (project_id, name);


--
-- Name: role_permissions uq_role_permission; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT uq_role_permission PRIMARY KEY (role_id, permission_id);


--
-- Name: user_roles uq_user_role; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT uq_user_role PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_afrd_churn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_afrd_churn ON public.agg_file_repo_day USING btree (repo_id, churn);


--
-- Name: idx_afrd_project_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_afrd_project_day ON public.agg_file_repo_day USING btree (project_id, day);


--
-- Name: idx_ahrd_project_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ahrd_project_day ON public.agg_hour_repo_day USING btree (project_id, day);


--
-- Name: idx_ard_author_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ard_author_day ON public.agg_author_repo_day USING btree (author_id, day);


--
-- Name: idx_ard_project_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ard_project_day ON public.agg_author_repo_day USING btree (project_id, day);


--
-- Name: idx_asbrd_project_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asbrd_project_day ON public.agg_size_bucket_repo_day USING btree (project_id, day);


--
-- Name: ix_user_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_roles_role_id ON public.user_roles USING btree (role_id);


--
-- Name: languages_name_en_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX languages_name_en_trgm ON public.languages USING gin (name_en public.gin_trgm_ops);


--
-- Name: languages_name_ru_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX languages_name_ru_trgm ON public.languages USING gin (name_ru public.gin_trgm_ops);


--
-- Name: users_email_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_trgm ON public.users USING gin (email public.gin_trgm_ops);


--
-- Name: users_username_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_username_trgm ON public.users USING gin (username public.gin_trgm_ops);


--
-- Name: agg_author_repo_day agg_author_repo_day_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_author_repo_day
    ADD CONSTRAINT agg_author_repo_day_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE CASCADE;


--
-- Name: agg_author_repo_day agg_author_repo_day_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_author_repo_day
    ADD CONSTRAINT agg_author_repo_day_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agg_author_repo_day agg_author_repo_day_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_author_repo_day
    ADD CONSTRAINT agg_author_repo_day_repo_id_fkey FOREIGN KEY (repo_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: agg_file_repo_day agg_file_repo_day_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_file_repo_day
    ADD CONSTRAINT agg_file_repo_day_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agg_file_repo_day agg_file_repo_day_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_file_repo_day
    ADD CONSTRAINT agg_file_repo_day_repo_id_fkey FOREIGN KEY (repo_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: agg_hour_repo_day agg_hour_repo_day_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_hour_repo_day
    ADD CONSTRAINT agg_hour_repo_day_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agg_hour_repo_day agg_hour_repo_day_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_hour_repo_day
    ADD CONSTRAINT agg_hour_repo_day_repo_id_fkey FOREIGN KEY (repo_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: agg_size_bucket_repo_day agg_size_bucket_repo_day_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_size_bucket_repo_day
    ADD CONSTRAINT agg_size_bucket_repo_day_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agg_size_bucket_repo_day agg_size_bucket_repo_day_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agg_size_bucket_repo_day
    ADD CONSTRAINT agg_size_bucket_repo_day_repo_id_fkey FOREIGN KEY (repo_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: branches branches_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_repo_id_fkey FOREIGN KEY (repo_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: commit_files commit_files_commit_sha_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commit_files
    ADD CONSTRAINT commit_files_commit_sha_fkey FOREIGN KEY (commit_sha) REFERENCES public.commits(sha) ON DELETE CASCADE;


--
-- Name: commits commits_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE SET NULL;


--
-- Name: commits commits_committer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_committer_id_fkey FOREIGN KEY (committer_id) REFERENCES public.authors(id) ON DELETE SET NULL;


--
-- Name: commits commits_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_repo_id_fkey FOREIGN KEY (repo_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: projects projects_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: repositories repositories_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_language_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_language_code_fkey FOREIGN KEY (language_code) REFERENCES public.languages(code);


--
-- PostgreSQL database dump complete
--


