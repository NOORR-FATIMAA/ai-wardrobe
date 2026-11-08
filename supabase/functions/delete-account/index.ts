// Permanently deletes the caller's photos and account. Database rows cascade from auth.users.
import { adminClient, getContext } from "../_shared/context.ts";
import { HttpError, serve } from "../_shared/http.ts";
import { removeUserFolder } from "../_shared/storage_cleanup.ts";

serve(async (req) => {
  const { user } = await getContext(req);
  const admin = adminClient();

  // Storage objects do not cascade, so empty the user's folder (nested folders included) first. The
  // folder comes only from the verified user id. If anything is left, the account is kept so the
  // user can retry instead of leaving photos behind.
  const { problems } = await removeUserFolder(admin.storage.from("wardrobe"), user.id);
  if (problems.length) {
    console.error(`delete-account: photo cleanup incomplete (${problems.join("; ")})`);
    throw new HttpError(500, "Could not delete all your photos. Please try again.");
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return { deleted: true };
});
