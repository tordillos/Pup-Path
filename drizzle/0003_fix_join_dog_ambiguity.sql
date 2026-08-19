-- El RETURNS TABLE declara variables llamadas dog_id y dog_name. En la
-- versión anterior, el ON CONFLICT (dog_id, user_id) del upsert no podía
-- resolverse: Postgres no sabía si dog_id era la variable o la columna, y
-- unirse con un código fallaba con 'column reference "dog_id" is ambiguous'.
-- Se sustituye el upsert por un INSERT guardado, con referencias siempre
-- cualificadas por el alias de la tabla.
CREATE OR REPLACE FUNCTION public.join_dog_by_code(p_code text)
RETURNS TABLE (dog_id uuid, dog_name text) AS $$
DECLARE
  v_dog public.dogs%ROWTYPE;
  v_user uuid := auth.uid();
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

  IF NOT EXISTS (
    SELECT 1 FROM public.dog_members m
    WHERE m.dog_id = v_dog.id AND m.user_id = v_user
  ) THEN
    BEGIN
      INSERT INTO public.dog_members (dog_id, user_id, role)
      VALUES (v_dog.id, v_user, 'trainer');
    EXCEPTION WHEN unique_violation THEN
      -- Dos pestañas canjeando el mismo código a la vez: ya está dentro.
      NULL;
    END;
  END IF;

  dog_id := v_dog.id;
  dog_name := v_dog.name;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
