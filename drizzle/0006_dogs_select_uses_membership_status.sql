-- La política de lectura de "dogs" llevaba su propio EXISTS sobre
-- dog_members en vez de llamar a is_dog_member(), así que se quedó sin el
-- filtro por status: quien solo había solicitado acceso seguía viendo la
-- ficha de la mascota (nombre y código de invitación incluidos), aunque no
-- pudiera ver su progreso.
DROP POLICY IF EXISTS "Users can view own dogs" ON "dogs";--> statement-breakpoint
CREATE POLICY "Users can view own dogs" ON "dogs" FOR SELECT USING (
  user_id = auth.uid() OR public.is_dog_member(id)
);
