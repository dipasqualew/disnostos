CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "tag_owner_id_name_key" UNIQUE("owner_id","name")
);
--> statement-breakpoint
CREATE TABLE "tagging" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"target_asset_id" uuid,
	"target_work_id" uuid,
	"target_myth_id" uuid,
	"target_beat_id" uuid,
	"target_wording_id" uuid,
	"target_version_id" uuid,
	"target_interpretation_id" uuid,
	"target_tradition_id" uuid,
	"target_mythology_id" uuid,
	"target_figure_id" uuid,
	"target_archetype_id" uuid,
	"target_trace_id" uuid,
	"target_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tagging_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "tagging_tag_id_target_key" UNIQUE NULLS NOT DISTINCT("tag_id","target_asset_id","target_work_id","target_myth_id","target_beat_id","target_wording_id","target_version_id","target_interpretation_id","target_tradition_id","target_mythology_id","target_figure_id","target_archetype_id","target_trace_id","target_journal_id"),
	CONSTRAINT "tagging_target_one" CHECK (num_nonnulls("tagging"."target_asset_id", "tagging"."target_work_id", "tagging"."target_myth_id", "tagging"."target_beat_id", "tagging"."target_wording_id", "tagging"."target_version_id", "tagging"."target_interpretation_id", "tagging"."target_tradition_id", "tagging"."target_mythology_id", "tagging"."target_figure_id", "tagging"."target_archetype_id", "tagging"."target_trace_id", "tagging"."target_journal_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "figure_archetype" DROP CONSTRAINT "figure_archetype_figure_id_archetype_id_key";--> statement-breakpoint
ALTER TABLE "figure_archetype" ADD COLUMN "tradition_id" uuid;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_asset_id_asset_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_work_id_work_id_fk" FOREIGN KEY ("target_work_id") REFERENCES "public"."work"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_myth_id_myth_id_fk" FOREIGN KEY ("target_myth_id") REFERENCES "public"."myth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_beat_id_beat_id_fk" FOREIGN KEY ("target_beat_id") REFERENCES "public"."beat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_wording_id_wording_id_fk" FOREIGN KEY ("target_wording_id") REFERENCES "public"."wording"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_version_id_version_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_interpretation_id_interpretation_id_fk" FOREIGN KEY ("target_interpretation_id") REFERENCES "public"."interpretation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_tradition_id_tradition_id_fk" FOREIGN KEY ("target_tradition_id") REFERENCES "public"."tradition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_mythology_id_mythology_id_fk" FOREIGN KEY ("target_mythology_id") REFERENCES "public"."mythology"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_figure_id_figure_id_fk" FOREIGN KEY ("target_figure_id") REFERENCES "public"."figure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_archetype_id_archetype_id_fk" FOREIGN KEY ("target_archetype_id") REFERENCES "public"."archetype"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_trace_id_trace_id_fk" FOREIGN KEY ("target_trace_id") REFERENCES "public"."trace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_target_journal_id_journal_id_fk" FOREIGN KEY ("target_journal_id") REFERENCES "public"."journal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging" ADD CONSTRAINT "tagging_tag_id_owner_fk" FOREIGN KEY ("tag_id","owner_id") REFERENCES "public"."tag"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_archetype" ADD CONSTRAINT "figure_archetype_tradition_id_tradition_id_fk" FOREIGN KEY ("tradition_id") REFERENCES "public"."tradition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_archetype" ADD CONSTRAINT "figure_archetype_figure_id_archetype_id_tradition_id_key" UNIQUE NULLS NOT DISTINCT("figure_id","archetype_id","tradition_id");