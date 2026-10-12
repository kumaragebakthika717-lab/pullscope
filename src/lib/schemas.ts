import { z } from "zod";

export const uuid = z.string().uuid();

export const createMatchSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    event_name: z.string().trim().max(200).optional().nullable(),
    left_puller: z.string().trim().min(1, "Left puller is required").max(100),
    right_puller: z.string().trim().min(1, "Right puller is required").max(100),
    source_type: z.enum(["youtube", "upload"]),
    youtube_id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{11}$/, "Invalid YouTube video")
      .optional()
      .nullable(),
  })
  .refine((v) => v.source_type !== "youtube" || !!v.youtube_id, {
    message: "A valid YouTube URL is required",
    path: ["youtube_id"],
  });
export type CreateMatchInput = z.infer<typeof createMatchSchema>;

export const annotationSchema = z.object({
  match_id: uuid,
  attribute_id: uuid,
  puller_side: z.enum(["left", "right"]),
  round_number: z.number().int().min(0).max(20),
  timestamp_sec: z.number().min(0).finite(),
  rating: z.enum(["green", "red", "black"]),
  note: z.string().max(2000).optional().nullable(),
  frame_path: z.string().max(500).optional().nullable(),
});
export type AnnotationInput = z.infer<typeof annotationSchema>;

export const annotationUpdateSchema = annotationSchema
  .pick({ attribute_id: true, puller_side: true, round_number: true, rating: true, note: true, timestamp_sec: true })
  .partial();
export type AnnotationUpdate = z.infer<typeof annotationUpdateSchema>;

export const attributeNameSchema = z.string().trim().min(1, "Name is required").max(80);
