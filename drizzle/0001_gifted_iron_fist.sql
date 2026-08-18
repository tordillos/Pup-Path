CREATE TABLE "dog_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'trainer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dogs" ADD COLUMN "share_code" text;--> statement-breakpoint
ALTER TABLE "dog_members" ADD CONSTRAINT "dog_members_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_members" ADD CONSTRAINT "dog_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dog_user_unique_idx" ON "dog_members" USING btree ("dog_id","user_id");