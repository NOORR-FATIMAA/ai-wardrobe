// Inspiration photos for an outfit: searches Unsplash for the short style phrase the stylist wrote
// (e.g. "cream knit camel trousers minimal"). Signed-in users only; no AI call and no AI quota.
import { z } from "npm:zod@4.6.7";
import { getContext } from "../_shared/context.ts";
import { serve } from "../_shared/http.ts";
import { searchPhotos } from "../_shared/unsplash.ts";

const Input = z.object({
  query: z.string().trim().min(2).max(200),
});

serve(async (req, body) => {
  await getContext(req);
  const { query } = Input.parse(body);
  return { photos: await searchPhotos(query) };
});
