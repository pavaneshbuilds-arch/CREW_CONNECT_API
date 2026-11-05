-- Admin can tag a confirmed assignment as the replacement for a no-show,
-- and the audit log can record the no-show itself.

ALTER TYPE "AssignmentMethod" ADD VALUE 'replacement';
ALTER TYPE "AuditActionType" ADD VALUE 'crew_marked_no_show';

ALTER TABLE "event_crew_assignments"
  ADD COLUMN "replaces_assignment_id" INTEGER;

CREATE UNIQUE INDEX "event_crew_assignments_replaces_assignment_id_key"
  ON "event_crew_assignments"("replaces_assignment_id");

ALTER TABLE "event_crew_assignments"
  ADD CONSTRAINT "event_crew_assignments_replaces_assignment_id_fkey"
  FOREIGN KEY ("replaces_assignment_id") REFERENCES "event_crew_assignments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
