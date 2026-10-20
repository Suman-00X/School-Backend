/* Archived years are read-only (0004): their admit cards are history, like the exam's papers */
CREATE TRIGGER admit_cards_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON admit_cards
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
