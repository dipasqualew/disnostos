CREATE TYPE "public"."archetype_kind" AS ENUM('role', 'setting', 'symbol', 'trope');--> statement-breakpoint
CREATE TYPE "public"."derivation_kind" AS ENUM('retells', 'echoes', 'inverts', 'borrows_from', 'contradicts');--> statement-breakpoint
CREATE TYPE "public"."figure_kind" AS ENUM('character', 'place', 'object');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."work_kind" AS ENUM('poem', 'image', 'song', 'play', 'book', 'film', 'study', 'other');--> statement-breakpoint
CREATE TYPE "public"."work_provenance" AS ENUM('ancient', 'modern', 'personal');--> statement-breakpoint
CREATE TYPE "public"."work_rights" AS ENUM('public_domain', 'licensed', 'in_copyright', 'own_work', 'unknown');--> statement-breakpoint
CREATE TABLE "archetype" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" uuid,
	"kind" "archetype_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archetype_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "asset_bucket_object_key_key" UNIQUE("bucket","object_key")
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"note" text,
	"target_beat_id" uuid,
	"target_version_id" uuid,
	"target_trace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "attachment_target_one" CHECK (num_nonnulls("attachment"."target_beat_id", "attachment"."target_version_id", "attachment"."target_trace_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "beat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" uuid,
	"myth_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beat_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "beat_archetype" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"beat_id" uuid NOT NULL,
	"archetype_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beat_archetype_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "beat_archetype_beat_id_archetype_id_key" UNIQUE("beat_id","archetype_id")
);
--> statement-breakpoint
CREATE TABLE "beat_figure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"beat_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beat_figure_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "beat_figure_beat_id_figure_id_key" UNIQUE("beat_id","figure_id")
);
--> statement-breakpoint
CREATE TABLE "citation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"locator" text,
	"note" text,
	"target_beat_id" uuid,
	"target_wording_id" uuid,
	"target_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "citation_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "citation_target_one" CHECK (num_nonnulls("citation"."target_beat_id", "citation"."target_wording_id", "citation"."target_version_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "derivation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "derivation_kind" NOT NULL,
	"note" text,
	"from_myth_id" uuid,
	"from_version_id" uuid,
	"from_beat_id" uuid,
	"from_figure_id" uuid,
	"to_myth_id" uuid,
	"to_version_id" uuid,
	"to_beat_id" uuid,
	"to_figure_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derivation_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "derivation_from_one" CHECK (num_nonnulls("derivation"."from_myth_id", "derivation"."from_version_id", "derivation"."from_beat_id", "derivation"."from_figure_id") = 1),
	CONSTRAINT "derivation_to_one" CHECK (num_nonnulls("derivation"."to_myth_id", "derivation"."to_version_id", "derivation"."to_beat_id", "derivation"."to_figure_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "figure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" uuid,
	"kind" "figure_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figure_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "figure_archetype" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"archetype_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figure_archetype_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "figure_archetype_figure_id_archetype_id_key" UNIQUE("figure_id","archetype_id")
);
--> statement-breakpoint
CREATE TABLE "figure_name" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"language" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figure_name_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "figure_name_figure_id_language_name_key" UNIQUE("figure_id","language","name")
);
--> statement-breakpoint
CREATE TABLE "interpretation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" uuid,
	"title" text,
	"body" text NOT NULL,
	"language" text NOT NULL,
	"promoted_from_trace_id" uuid,
	"target_version_id" uuid,
	"target_beat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interpretation_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "interpretation_target_one" CHECK (num_nonnulls("interpretation"."target_version_id", "interpretation"."target_beat_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "journal_trace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_trace_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "journal_trace_journal_id_trace_id_key" UNIQUE("journal_id","trace_id"),
	CONSTRAINT "journal_trace_journal_id_position_key" UNIQUE("journal_id","position")
);
--> statement-breakpoint
CREATE TABLE "myth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" uuid,
	"title" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "myth_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "mythology" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mythology_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "mythology_tradition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"mythology_id" uuid NOT NULL,
	"tradition_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mythology_tradition_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "mythology_tradition_mythology_id_tradition_id_key" UNIQUE("mythology_id","tradition_id")
);
--> statement-breakpoint
CREATE TABLE "share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"grantee_id" uuid NOT NULL,
	"target_mythology_id" uuid,
	"target_tradition_id" uuid,
	"target_version_id" uuid,
	"target_myth_id" uuid,
	"target_journal_id" uuid,
	"target_trace_id" uuid,
	"target_figure_id" uuid,
	"target_archetype_id" uuid,
	"target_work_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "share_target_one" CHECK (num_nonnulls("share"."target_mythology_id", "share"."target_tradition_id", "share"."target_version_id", "share"."target_myth_id", "share"."target_journal_id", "share"."target_trace_id", "share"."target_figure_id", "share"."target_archetype_id", "share"."target_work_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "trace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"language" text,
	"written_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trace_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "trace_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"note" text,
	"target_beat_id" uuid,
	"target_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trace_link_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "trace_link_target_one" CHECK (num_nonnulls("trace_link"."target_beat_id", "trace_link"."target_version_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "tradition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tradition_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "tradition_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"tradition_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tradition_version_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "tradition_version_tradition_id_version_id_key" UNIQUE("tradition_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" uuid,
	"myth_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "version_beat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"beat_id" uuid NOT NULL,
	"wording_id" uuid,
	"position" double precision NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_beat_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "version_beat_version_id_position_key" UNIQUE("version_id","position")
);
--> statement-breakpoint
CREATE TABLE "version_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_revision_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "version_revision_version_id_number_key" UNIQUE("version_id","number")
);
--> statement-breakpoint
CREATE TABLE "wording" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" uuid,
	"beat_id" uuid NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"translated_from_id" uuid,
	"promoted_from_trace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wording_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "wording_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"wording_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wording_revision_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "wording_revision_wording_id_number_key" UNIQUE("wording_id","number")
);
--> statement-breakpoint
CREATE TABLE "work" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"kind" "work_kind" NOT NULL,
	"title" text NOT NULL,
	"creator" text,
	"date_label" text,
	"provenance" "work_provenance" NOT NULL,
	"rights" "work_rights" NOT NULL,
	"url" text,
	"asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "archetype" ADD CONSTRAINT "archetype_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archetype" ADD CONSTRAINT "archetype_forked_from_id_archetype_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."archetype"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_target_beat_id_beat_id_fk" FOREIGN KEY ("target_beat_id") REFERENCES "public"."beat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_target_version_id_version_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_target_trace_id_trace_id_fk" FOREIGN KEY ("target_trace_id") REFERENCES "public"."trace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_work_id_owner_fk" FOREIGN KEY ("work_id","owner_id") REFERENCES "public"."work"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat" ADD CONSTRAINT "beat_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat" ADD CONSTRAINT "beat_forked_from_id_beat_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."beat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat" ADD CONSTRAINT "beat_myth_id_owner_fk" FOREIGN KEY ("myth_id","owner_id") REFERENCES "public"."myth"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat_archetype" ADD CONSTRAINT "beat_archetype_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat_archetype" ADD CONSTRAINT "beat_archetype_beat_id_owner_fk" FOREIGN KEY ("beat_id","owner_id") REFERENCES "public"."beat"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat_archetype" ADD CONSTRAINT "beat_archetype_archetype_id_owner_fk" FOREIGN KEY ("archetype_id","owner_id") REFERENCES "public"."archetype"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat_figure" ADD CONSTRAINT "beat_figure_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat_figure" ADD CONSTRAINT "beat_figure_beat_id_owner_fk" FOREIGN KEY ("beat_id","owner_id") REFERENCES "public"."beat"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat_figure" ADD CONSTRAINT "beat_figure_figure_id_owner_fk" FOREIGN KEY ("figure_id","owner_id") REFERENCES "public"."figure"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation" ADD CONSTRAINT "citation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation" ADD CONSTRAINT "citation_target_beat_id_beat_id_fk" FOREIGN KEY ("target_beat_id") REFERENCES "public"."beat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation" ADD CONSTRAINT "citation_target_wording_id_wording_id_fk" FOREIGN KEY ("target_wording_id") REFERENCES "public"."wording"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation" ADD CONSTRAINT "citation_target_version_id_version_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation" ADD CONSTRAINT "citation_work_id_owner_fk" FOREIGN KEY ("work_id","owner_id") REFERENCES "public"."work"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_from_myth_id_myth_id_fk" FOREIGN KEY ("from_myth_id") REFERENCES "public"."myth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_from_version_id_version_id_fk" FOREIGN KEY ("from_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_from_beat_id_beat_id_fk" FOREIGN KEY ("from_beat_id") REFERENCES "public"."beat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_from_figure_id_figure_id_fk" FOREIGN KEY ("from_figure_id") REFERENCES "public"."figure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_to_myth_id_myth_id_fk" FOREIGN KEY ("to_myth_id") REFERENCES "public"."myth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_to_version_id_version_id_fk" FOREIGN KEY ("to_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_to_beat_id_beat_id_fk" FOREIGN KEY ("to_beat_id") REFERENCES "public"."beat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation" ADD CONSTRAINT "derivation_to_figure_id_figure_id_fk" FOREIGN KEY ("to_figure_id") REFERENCES "public"."figure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_forked_from_id_figure_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."figure"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_archetype" ADD CONSTRAINT "figure_archetype_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_archetype" ADD CONSTRAINT "figure_archetype_figure_id_owner_fk" FOREIGN KEY ("figure_id","owner_id") REFERENCES "public"."figure"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_archetype" ADD CONSTRAINT "figure_archetype_archetype_id_owner_fk" FOREIGN KEY ("archetype_id","owner_id") REFERENCES "public"."archetype"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_name" ADD CONSTRAINT "figure_name_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_name" ADD CONSTRAINT "figure_name_figure_id_owner_fk" FOREIGN KEY ("figure_id","owner_id") REFERENCES "public"."figure"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation" ADD CONSTRAINT "interpretation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation" ADD CONSTRAINT "interpretation_forked_from_id_interpretation_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."interpretation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation" ADD CONSTRAINT "interpretation_promoted_from_trace_id_trace_id_fk" FOREIGN KEY ("promoted_from_trace_id") REFERENCES "public"."trace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation" ADD CONSTRAINT "interpretation_target_version_id_version_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation" ADD CONSTRAINT "interpretation_target_beat_id_beat_id_fk" FOREIGN KEY ("target_beat_id") REFERENCES "public"."beat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_trace" ADD CONSTRAINT "journal_trace_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_trace" ADD CONSTRAINT "journal_trace_journal_id_owner_fk" FOREIGN KEY ("journal_id","owner_id") REFERENCES "public"."journal"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_trace" ADD CONSTRAINT "journal_trace_trace_id_owner_fk" FOREIGN KEY ("trace_id","owner_id") REFERENCES "public"."trace"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "myth" ADD CONSTRAINT "myth_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "myth" ADD CONSTRAINT "myth_forked_from_id_myth_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."myth"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mythology" ADD CONSTRAINT "mythology_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mythology_tradition" ADD CONSTRAINT "mythology_tradition_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mythology_tradition" ADD CONSTRAINT "mythology_tradition_mythology_id_owner_fk" FOREIGN KEY ("mythology_id","owner_id") REFERENCES "public"."mythology"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mythology_tradition" ADD CONSTRAINT "mythology_tradition_tradition_id_owner_fk" FOREIGN KEY ("tradition_id","owner_id") REFERENCES "public"."tradition"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_grantee_id_user_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_mythology_id_mythology_id_fk" FOREIGN KEY ("target_mythology_id") REFERENCES "public"."mythology"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_tradition_id_tradition_id_fk" FOREIGN KEY ("target_tradition_id") REFERENCES "public"."tradition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_version_id_version_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_myth_id_myth_id_fk" FOREIGN KEY ("target_myth_id") REFERENCES "public"."myth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_journal_id_journal_id_fk" FOREIGN KEY ("target_journal_id") REFERENCES "public"."journal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_trace_id_trace_id_fk" FOREIGN KEY ("target_trace_id") REFERENCES "public"."trace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_figure_id_figure_id_fk" FOREIGN KEY ("target_figure_id") REFERENCES "public"."figure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_archetype_id_archetype_id_fk" FOREIGN KEY ("target_archetype_id") REFERENCES "public"."archetype"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target_work_id_work_id_fk" FOREIGN KEY ("target_work_id") REFERENCES "public"."work"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace" ADD CONSTRAINT "trace_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_link" ADD CONSTRAINT "trace_link_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_link" ADD CONSTRAINT "trace_link_target_beat_id_beat_id_fk" FOREIGN KEY ("target_beat_id") REFERENCES "public"."beat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_link" ADD CONSTRAINT "trace_link_target_version_id_version_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_link" ADD CONSTRAINT "trace_link_trace_id_owner_fk" FOREIGN KEY ("trace_id","owner_id") REFERENCES "public"."trace"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradition" ADD CONSTRAINT "tradition_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradition_version" ADD CONSTRAINT "tradition_version_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradition_version" ADD CONSTRAINT "tradition_version_tradition_id_owner_fk" FOREIGN KEY ("tradition_id","owner_id") REFERENCES "public"."tradition"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradition_version" ADD CONSTRAINT "tradition_version_version_id_owner_fk" FOREIGN KEY ("version_id","owner_id") REFERENCES "public"."version"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_forked_from_id_version_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_myth_id_owner_fk" FOREIGN KEY ("myth_id","owner_id") REFERENCES "public"."myth"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_beat" ADD CONSTRAINT "version_beat_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_beat" ADD CONSTRAINT "version_beat_wording_id_wording_id_fk" FOREIGN KEY ("wording_id") REFERENCES "public"."wording"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_beat" ADD CONSTRAINT "version_beat_version_id_owner_fk" FOREIGN KEY ("version_id","owner_id") REFERENCES "public"."version"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_beat" ADD CONSTRAINT "version_beat_beat_id_owner_fk" FOREIGN KEY ("beat_id","owner_id") REFERENCES "public"."beat"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_revision" ADD CONSTRAINT "version_revision_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_revision" ADD CONSTRAINT "version_revision_version_id_owner_fk" FOREIGN KEY ("version_id","owner_id") REFERENCES "public"."version"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wording" ADD CONSTRAINT "wording_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wording" ADD CONSTRAINT "wording_forked_from_id_wording_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."wording"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wording" ADD CONSTRAINT "wording_translated_from_id_wording_id_fk" FOREIGN KEY ("translated_from_id") REFERENCES "public"."wording"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wording" ADD CONSTRAINT "wording_promoted_from_trace_id_trace_id_fk" FOREIGN KEY ("promoted_from_trace_id") REFERENCES "public"."trace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wording" ADD CONSTRAINT "wording_beat_id_owner_fk" FOREIGN KEY ("beat_id","owner_id") REFERENCES "public"."beat"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wording_revision" ADD CONSTRAINT "wording_revision_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wording_revision" ADD CONSTRAINT "wording_revision_wording_id_owner_fk" FOREIGN KEY ("wording_id","owner_id") REFERENCES "public"."wording"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work" ADD CONSTRAINT "work_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work" ADD CONSTRAINT "work_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;