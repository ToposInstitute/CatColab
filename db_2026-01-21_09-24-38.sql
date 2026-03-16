--
-- PostgreSQL database dump
--

\restrict fvGZ2CQ4P5MJrnZ4psXfOfiw56ZvTtNNBQVUjSRJ6sVyx2TavJBp8dvqFUrFZwh

-- Dumped from database version 15.15
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.snapshots DROP CONSTRAINT IF EXISTS snapshots_for_ref_fkey;
ALTER TABLE IF EXISTS ONLY public.refs DROP CONSTRAINT IF EXISTS refs_head_fkey;
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS permissions_subject_fkey;
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS permissions_object_fkey;
DROP INDEX IF EXISTS public.permissions_object_subject_idx;
DROP INDEX IF EXISTS public.permissions_object_idx;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.storage DROP CONSTRAINT IF EXISTS storage_pkey;
ALTER TABLE IF EXISTS ONLY public.snapshots DROP CONSTRAINT IF EXISTS snapshots_pkey;
ALTER TABLE IF EXISTS ONLY public.refs DROP CONSTRAINT IF EXISTS refs_pkey;
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS permissions_is_relation;
ALTER TABLE IF EXISTS ONLY public._sqlx_migrator_migrations DROP CONSTRAINT IF EXISTS _sqlx_migrator_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public._sqlx_migrator_migrations DROP CONSTRAINT IF EXISTS _sqlx_migrator_migrations_app_name_key;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.storage;
DROP TABLE IF EXISTS public.snapshots;
DROP TABLE IF EXISTS public.refs;
DROP TABLE IF EXISTS public.permissions;
DROP TABLE IF EXISTS public._sqlx_migrator_migrations;
DROP FUNCTION IF EXISTS public.get_ref_stubs(in_searcher_id text, in_ref_ids uuid[]);
DROP FUNCTION IF EXISTS public.get_max_permission(in_subject text, in_object uuid);
DROP TYPE IF EXISTS public.permission_level;
--
-- Name: permission_level; Type: TYPE; Schema: public; Owner: catcolab
--

CREATE TYPE public.permission_level AS ENUM (
    'read',
    'write',
    'maintain',
    'own'
);


ALTER TYPE public.permission_level OWNER TO catcolab;

--
-- Name: get_max_permission(text, uuid); Type: FUNCTION; Schema: public; Owner: catcolab
--

CREATE FUNCTION public.get_max_permission(in_subject text, in_object uuid) RETURNS public.permission_level
    LANGUAGE sql STABLE
    AS $$
            SELECT COALESCE(
                -- 1st preference: the user's explicit permission
                (SELECT p.level
                    FROM permissions AS p
                    WHERE p.object = in_object
                        AND p.subject = in_subject
                    LIMIT 1
                ),
                -- 2nd: the public "read" fallback, if there’s a public row
                (SELECT 'read'::permission_level
                    FROM permissions AS p
                    WHERE p.object = in_object
                        AND p.subject IS NULL
                    LIMIT 1
                 )
            );
            $$;


ALTER FUNCTION public.get_max_permission(in_subject text, in_object uuid) OWNER TO catcolab;

--
-- Name: get_ref_stubs(text, uuid[]); Type: FUNCTION; Schema: public; Owner: catcolab
--

CREATE FUNCTION public.get_ref_stubs(in_searcher_id text, in_ref_ids uuid[]) RETURNS TABLE(ref_id uuid, name text, type_name text, created_at timestamp with time zone, permission_level public.permission_level, owner_id text, owner_username text, owner_display_name text)
    LANGUAGE sql STABLE
    AS $$
            SELECT
              refs.id                                   AS ref_id,
              snapshots.content->>'name'                AS name,
              snapshots.content->>'type'                AS type_name,
              refs.created                              AS created_at,
              get_max_permission(in_searcher_id, refs.id)       AS permission_level,
              owner.id                                  AS owner_id,
              owner.username                            AS owner_username,
              owner.display_name                        AS owner_display_name
            FROM
              unnest(in_ref_ids) WITH ORDINALITY AS unnested_ref_ids(ref_id, ord)
              JOIN refs      ON refs.id      = unnested_ref_ids.ref_id
              JOIN snapshots ON snapshots.id = refs.head
              JOIN permissions p_owner
                ON p_owner.object = refs.id
               AND p_owner.level  = 'own'
              LEFT JOIN users owner
                ON owner.id = p_owner.subject
            ORDER BY
                unnested_ref_ids.ord
            $$;


ALTER FUNCTION public.get_ref_stubs(in_searcher_id text, in_ref_ids uuid[]) OWNER TO catcolab;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _sqlx_migrator_migrations; Type: TABLE; Schema: public; Owner: catcolab
--

CREATE TABLE public._sqlx_migrator_migrations (
    id integer NOT NULL,
    app text NOT NULL,
    name text NOT NULL,
    applied_time timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public._sqlx_migrator_migrations OWNER TO catcolab;

--
-- Name: _sqlx_migrator_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: catcolab
--

ALTER TABLE public._sqlx_migrator_migrations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public._sqlx_migrator_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: catcolab
--

CREATE TABLE public.permissions (
    subject text,
    object uuid NOT NULL,
    level public.permission_level NOT NULL
);


ALTER TABLE public.permissions OWNER TO catcolab;

--
-- Name: refs; Type: TABLE; Schema: public; Owner: catcolab
--

CREATE TABLE public.refs (
    id uuid NOT NULL,
    head integer NOT NULL,
    created timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.refs OWNER TO catcolab;

--
-- Name: snapshots; Type: TABLE; Schema: public; Owner: catcolab
--

CREATE TABLE public.snapshots (
    id integer NOT NULL,
    for_ref uuid NOT NULL,
    content jsonb NOT NULL,
    last_updated timestamp with time zone NOT NULL,
    doc_id text NOT NULL
);


ALTER TABLE public.snapshots OWNER TO catcolab;

--
-- Name: snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: catcolab
--

ALTER TABLE public.snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: storage; Type: TABLE; Schema: public; Owner: catcolab
--

CREATE TABLE public.storage (
    key text[] NOT NULL,
    data bytea NOT NULL
);


ALTER TABLE public.storage OWNER TO catcolab;

--
-- Name: users; Type: TABLE; Schema: public; Owner: catcolab
--

CREATE TABLE public.users (
    id text NOT NULL,
    created timestamp with time zone NOT NULL,
    signed_in timestamp with time zone NOT NULL,
    username text,
    display_name text
);


ALTER TABLE public.users OWNER TO catcolab;

--
-- Data for Name: _sqlx_migrator_migrations; Type: TABLE DATA; Schema: public; Owner: catcolab
--

COPY public._sqlx_migrator_migrations (id, app, name, applied_time) FROM stdin;
1	backend	20241004010448_document_refs	2026-01-21 00:08:22.50993+00
2	backend	20241025030906_users	2026-01-21 00:08:22.526847+00
3	backend	20250409171833_add_permissions_object_subject_idx	2026-01-21 00:08:22.561711+00
4	backend	20250516154702_automerge_storage	2026-01-21 00:08:23.018008+00
5	backend	20250805230408_fix_automerge_storage	2026-01-21 00:08:23.342344+00
6	backend	20251006141026_get_ref_stubs	2026-01-21 00:08:23.34498+00
7	backend	20250924133640_add_refs_deleted_at	2026-01-21 00:08:23.350824+00
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: catcolab
--

COPY public.permissions (subject, object, level) FROM stdin;
\.


--
-- Data for Name: refs; Type: TABLE DATA; Schema: public; Owner: catcolab
--

COPY public.refs (id, head, created, deleted_at) FROM stdin;
\.


--
-- Data for Name: snapshots; Type: TABLE DATA; Schema: public; Owner: catcolab
--

COPY public.snapshots (id, for_ref, content, last_updated, doc_id) FROM stdin;
\.


--
-- Data for Name: storage; Type: TABLE DATA; Schema: public; Owner: catcolab
--

COPY public.storage (key, data) FROM stdin;
{storage-adapter-id}	\\x36613532323833342d326163332d346164362d393933642d356337623830306231646536
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: catcolab
--

COPY public.users (id, created, signed_in, username, display_name) FROM stdin;
\.


--
-- Name: _sqlx_migrator_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catcolab
--

SELECT pg_catalog.setval('public._sqlx_migrator_migrations_id_seq', 7, true);


--
-- Name: snapshots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catcolab
--

SELECT pg_catalog.setval('public.snapshots_id_seq', 1, false);


--
-- Name: _sqlx_migrator_migrations _sqlx_migrator_migrations_app_name_key; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public._sqlx_migrator_migrations
    ADD CONSTRAINT _sqlx_migrator_migrations_app_name_key UNIQUE (app, name);


--
-- Name: _sqlx_migrator_migrations _sqlx_migrator_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public._sqlx_migrator_migrations
    ADD CONSTRAINT _sqlx_migrator_migrations_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_is_relation; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_is_relation UNIQUE (subject, object);


--
-- Name: refs refs_pkey; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.refs
    ADD CONSTRAINT refs_pkey PRIMARY KEY (id);


--
-- Name: snapshots snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.snapshots
    ADD CONSTRAINT snapshots_pkey PRIMARY KEY (id);


--
-- Name: storage storage_pkey; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.storage
    ADD CONSTRAINT storage_pkey PRIMARY KEY (key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: permissions_object_idx; Type: INDEX; Schema: public; Owner: catcolab
--

CREATE INDEX permissions_object_idx ON public.permissions USING btree (object);


--
-- Name: permissions_object_subject_idx; Type: INDEX; Schema: public; Owner: catcolab
--

CREATE INDEX permissions_object_subject_idx ON public.permissions USING btree (object, subject);


--
-- Name: permissions permissions_object_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_object_fkey FOREIGN KEY (object) REFERENCES public.refs(id);


--
-- Name: permissions permissions_subject_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_subject_fkey FOREIGN KEY (subject) REFERENCES public.users(id);


--
-- Name: refs refs_head_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.refs
    ADD CONSTRAINT refs_head_fkey FOREIGN KEY (head) REFERENCES public.snapshots(id);


--
-- Name: snapshots snapshots_for_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catcolab
--

ALTER TABLE ONLY public.snapshots
    ADD CONSTRAINT snapshots_for_ref_fkey FOREIGN KEY (for_ref) REFERENCES public.refs(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO catcolab;


--
-- PostgreSQL database dump complete
--

\unrestrict fvGZ2CQ4P5MJrnZ4psXfOfiw56ZvTtNNBQVUjSRJ6sVyx2TavJBp8dvqFUrFZwh

