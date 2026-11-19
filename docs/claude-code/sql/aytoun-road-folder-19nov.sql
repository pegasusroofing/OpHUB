-- 1-20 Aytoun Road (RTB Roofing, job 2698): its OneDrive sync folder linked back to the job's own folder (applied by
-- Claude on 19 Nov 2026 at Andy's go-ahead: "Yes link to the main job folder"). It had been linked by hand to its
-- "1. Progress Reports (Safety Culture)" subfolder while the job pack was still making the folders. The same three
-- fields the app's Change folder button sets; nothing else changed.
update sites set onedrive_folder_id = job_pack->>'root_id', onedrive_folder_name = '1-20 Aytoun Road', onedrive_drive_id = job_pack->>'drive_id'
where id = '9d34e555-8532-4ae3-aaa5-3ad1efea61ff' and job_pack->>'root_id' is not null;
