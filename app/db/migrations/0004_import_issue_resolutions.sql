alter table inventory_import_issues
  add column if not exists resolution_action text
    check (resolution_action in ('correct_value', 'keep_separate', 'accept_warning', 'reject_row')),
  add column if not exists corrected_value text;
