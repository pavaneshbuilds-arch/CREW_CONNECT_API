-- Photo for crew emergency contacts, and one phone number per crew member.

ALTER TABLE "crew_sos_contacts"
  ADD COLUMN "photo_url" TEXT;

CREATE UNIQUE INDEX "crew_sos_contacts_crew_id_phone_key"
  ON "crew_sos_contacts"("crew_id", "phone");
