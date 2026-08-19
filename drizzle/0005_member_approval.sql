-- =====================================================================
-- 1. El entrenador no cambia el nombre de la mascota
-- ---------------------------------------------------------------------
-- La política de UPDATE incluía a los miembros, así que un invitado podía
-- renombrar el perro de otro. El nombre es del propietario.
-- =====================================================================
DROP POLICY IF EXISTS "Users can update own dogs" ON "dogs";--> statement-breakpoint
CREATE POLICY "Users can update own dogs" ON "dogs" FOR UPDATE USING (
  auth.uid() = user_id
);--> statement-breakpoint

-- =====================================================================
-- 2. Unirse pasa a ser una solicitud que el dueño acepta
-- ---------------------------------------------------------------------
-- Hasta ahora, quien tuviera el código entraba directo. Las filas que ya
-- existen se dan por aceptadas: nadie debe perder un acceso que ya tenía.
-- =====================================================================
ALTER TABLE "dog_members" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "dog_members" DROP CONSTRAINT IF EXISTS "dog_members_status_check";--> statement-breakpoint
ALTER TABLE "dog_members" ADD CONSTRAINT "dog_members_status_check" CHECK ("status" IN ('pending', 'active'));--> statement-breakpoint

-- Las nuevas nacen pendientes; las de antes se quedan como estaban.
ALTER TABLE "dog_members" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint

-- El corazón del permiso: una solicitud pendiente NO da acceso. Como esta
-- función la usan las políticas de dogs, task_progress y training_sessions,
-- basta cambiarla aquí para que el pendiente no vea nada.
CREATE OR REPLACE FUNCTION public.is_dog_member(_dog_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.dogs d WHERE d.id = _dog_id AND d.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.dog_members dm
    WHERE dm.dog_id = _dog_id AND dm.user_id = auth.uid() AND dm.status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;--> statement-breakpoint

-- Quien solicita debe poder ver su propia fila para saber que está en cola,
-- aunque todavía no tenga acceso a la mascota.
DROP POLICY IF EXISTS "Users can view dog members" ON "dog_members";--> statement-breakpoint
CREATE POLICY "Users can view dog members" ON "dog_members" FOR SELECT USING (
  user_id = auth.uid() OR public.is_dog_member(dog_id)
);--> statement-breakpoint

-- Aceptar una solicitud es un UPDATE, y solo lo hace el propietario.
DROP POLICY IF EXISTS "Owners can approve dog members" ON "dog_members";--> statement-breakpoint
CREATE POLICY "Owners can approve dog members" ON "dog_members" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.dogs d WHERE d.id = dog_id AND d.user_id = auth.uid())
);--> statement-breakpoint

-- El RPC ahora devuelve también en qué estado queda la solicitud. Cambia el
-- tipo de retorno, así que hay que soltar la versión anterior primero.
DROP FUNCTION IF EXISTS public.join_dog_by_code(text);--> statement-breakpoint
CREATE FUNCTION public.join_dog_by_code(p_code text)
RETURNS TABLE (dog_id uuid, dog_name text, member_status text) AS $$
DECLARE
  v_dog public.dogs%ROWTYPE;
  v_user uuid := auth.uid();
  v_status text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para unirte a una mascota.';
  END IF;

  SELECT d.* INTO v_dog FROM public.dogs d WHERE d.share_code = upper(trim(p_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe ninguna mascota con ese código de invitación.';
  END IF;

  IF v_dog.user_id = v_user THEN
    RAISE EXCEPTION 'Ya eres el propietario de esta mascota.';
  END IF;

  SELECT m.status INTO v_status FROM public.dog_members m
  WHERE m.dog_id = v_dog.id AND m.user_id = v_user;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.dog_members (dog_id, user_id, role, status)
      VALUES (v_dog.id, v_user, 'trainer', 'pending');
      v_status := 'pending';
    EXCEPTION WHEN unique_violation THEN
      -- Dos pestañas canjeando a la vez: vale la fila que llegó primero.
      SELECT m.status INTO v_status FROM public.dog_members m
      WHERE m.dog_id = v_dog.id AND m.user_id = v_user;
    END;
  END IF;

  dog_id := v_dog.id;
  dog_name := v_dog.name;
  member_status := v_status;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.join_dog_by_code(text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.join_dog_by_code(text) TO authenticated;
