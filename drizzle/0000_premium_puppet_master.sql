CREATE TABLE "dogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT 'Mi Perro' NOT NULL,
	"breed" text DEFAULT 'Border Collie',
	"birth_date" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"mastered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"duration_minutes" integer DEFAULT 5,
	"rating" integer,
	"notes" text,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dog_task_unique_idx" ON "task_progress" USING btree ("dog_id","task_id");--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dogs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own profile" ON "profiles";--> statement-breakpoint
CREATE POLICY "Users can view own profile" ON "profiles" FOR SELECT USING (auth.uid() = id);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can update own profile" ON "profiles";--> statement-breakpoint
CREATE POLICY "Users can update own profile" ON "profiles" FOR UPDATE USING (auth.uid() = id);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can insert own profile" ON "profiles";--> statement-breakpoint
CREATE POLICY "Users can insert own profile" ON "profiles" FOR INSERT WITH CHECK (auth.uid() = id);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own dogs" ON "dogs";--> statement-breakpoint
CREATE POLICY "Users can view own dogs" ON "dogs" FOR SELECT USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can insert own dogs" ON "dogs";--> statement-breakpoint
CREATE POLICY "Users can insert own dogs" ON "dogs" FOR INSERT WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can update own dogs" ON "dogs";--> statement-breakpoint
CREATE POLICY "Users can update own dogs" ON "dogs" FOR UPDATE USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can delete own dogs" ON "dogs";--> statement-breakpoint
CREATE POLICY "Users can delete own dogs" ON "dogs" FOR DELETE USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own task progress" ON "task_progress";--> statement-breakpoint
CREATE POLICY "Users can view own task progress" ON "task_progress" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "dogs" WHERE "dogs"."id" = "task_progress"."dog_id" AND "dogs"."user_id" = auth.uid())
);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can insert own task progress" ON "task_progress";--> statement-breakpoint
CREATE POLICY "Users can insert own task progress" ON "task_progress" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM "dogs" WHERE "dogs"."id" = "task_progress"."dog_id" AND "dogs"."user_id" = auth.uid())
);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can update own task progress" ON "task_progress";--> statement-breakpoint
CREATE POLICY "Users can update own task progress" ON "task_progress" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM "dogs" WHERE "dogs"."id" = "task_progress"."dog_id" AND "dogs"."user_id" = auth.uid())
);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can delete own task progress" ON "task_progress";--> statement-breakpoint
CREATE POLICY "Users can delete own task progress" ON "task_progress" FOR DELETE USING (
  EXISTS (SELECT 1 FROM "dogs" WHERE "dogs"."id" = "task_progress"."dog_id" AND "dogs"."user_id" = auth.uid())
);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own training sessions" ON "training_sessions";--> statement-breakpoint
CREATE POLICY "Users can view own training sessions" ON "training_sessions" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "dogs" WHERE "dogs"."id" = "training_sessions"."dog_id" AND "dogs"."user_id" = auth.uid())
);--> statement-breakpoint
DROP POLICY IF EXISTS "Users can insert own training sessions" ON "training_sessions";--> statement-breakpoint
CREATE POLICY "Users can insert own training sessions" ON "training_sessions" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM "dogs" WHERE "dogs"."id" = "training_sessions"."dog_id" AND "dogs"."user_id" = auth.uid())
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
