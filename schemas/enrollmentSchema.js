const { z } = require("zod");

const enrollmentSchema = z
  .object({
    studentStatus: z.enum(["normal", "probation"]),
    maxCredits: z.number().int().min(1).max(25),
  })
  .superRefine((data, ctx) => {
    if (data.studentStatus === "probation" && data.maxCredits > 22) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxCredits"],
        message: "Students on probation cannot enroll in more than 22 credits",
      });
    }
  });

module.exports = { enrollmentSchema };
