ALTER TABLE "dogs" ADD CONSTRAINT "dogs_share_code_unique" UNIQUE("share_code");--> statement-breakpoint

-- =====================================================================
-- Compartir mascota: lo que faltaba para que unirse por código funcione
-- ---------------------------------------------------------------------
-- La base de datos ya tenía el trigger de códigos y las políticas por
-- pertenencia (is_dog_member). Esta migración añade solo el delta:
-- unicidad del código, el RPC para unirse, y tres políticas que faltaban.
-- =====================================================================

-- El generador anterior no comprobaba unicidad; con la restricción UNIQUE
-- recién añadida, una colisión rompería el alta de la mascota. Reintenta.
-- SECURITY DEFINER porque comprobar la colisión exige leer mascotas ajenas.
CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS trigger AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
BEGIN
  IF NEW.share_code IS NULL OR NEW.share_code = '' THEN
    LOOP
      candidate := '';
      FOR i IN 1..6 LOOP
        candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.dogs WHERE share_code = candidate);
    END LOOP;
    NEW.share_code := candidate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;--> statement-breakpoint

-- Mascotas anteriores al trigger
UPDATE public.dogs SET share_code = upper(substring(md5(random()::text) from 1 for 6))
WHERE share_code IS NULL OR share_code = '';--> statement-breakpoint

-- =====================================================================
-- Unirse con un código
-- ---------------------------------------------------------------------
-- SECURITY DEFINER para que quien se une no necesite leer "dogs": entrega
-- el código y recibe la mascota, sin poder listar ni sondear las ajenas.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.join_dog_by_code(p_code text)
RETURNS TABLE (dog_id uuid, dog_name text) AS $$
DECLARE
  v_dog public.dogs%ROWTYPE;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para unirte a una mascota.';
  END IF;

  SELECT * INTO v_dog FROM public.dogs WHERE share_code = upper(trim(p_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe ninguna mascota con ese código de invitación.';
  END IF;

  IF v_dog.user_id = v_user THEN
    RAISE EXCEPTION 'Ya eres el propietario de esta mascota.';
  END IF;

  INSERT INTO public.dog_members (dog_id, user_id, role)
  VALUES (v_dog.id, v_user, 'trainer')
  ON CONFLICT (dog_id, user_id) DO NOTHING;

  dog_id := v_dog.id;
  dog_name := v_dog.name;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.join_dog_by_code(text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.join_dog_by_code(text) TO authenticated;--> statement-breakpoint

-- La política anterior permitía "auth.uid() = user_id", es decir, que
-- cualquiera se añadiera a sí mismo a cualquier mascota conociendo su id,
-- sin código. El alta pasa a ser exclusiva del RPC (que salta RLS) o del
-- propietario de la mascota.
DROP POLICY IF EXISTS "Users can insert dog members" ON "dog_members";--> statement-breakpoint
CREATE POLICY "Owners can add dog members" ON "dog_members" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.dogs d WHERE d.id = dog_id AND d.user_id = auth.uid())
);--> statement-breakpoint

-- Sin esto, la lista de entrenadores sale vacía: profiles solo dejaba ver
-- el perfil propio.
DROP POLICY IF EXISTS "Users can view own profile" ON "profiles";--> statement-breakpoint
CREATE POLICY "Users can view own profile" ON "profiles" FOR SELECT USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM public.dog_members m
    WHERE m.user_id = profiles.id AND public.is_dog_member(m.dog_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.dogs d
    WHERE d.user_id = profiles.id AND public.is_dog_member(d.id)
  )
);--> statement-breakpoint

-- Resetear el progreso borra sesiones de entrenamiento y no había política
-- de DELETE, así que ese borrado fallaba en silencio.
DROP POLICY IF EXISTS "Users can delete own training sessions" ON "training_sessions";--> statement-breakpoint
CREATE POLICY "Users can delete own training sessions" ON "training_sessions" FOR DELETE USING (
  public.is_dog_member(dog_id)
);
