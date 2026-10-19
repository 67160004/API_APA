const { enrollmentSchema } = require("../schemas/enrollmentSchema");

describe("Enrollment Schema", () => {
  test("normal ลงทะเบียน 25 หน่วยกิตได้", () => {
    expect(
      enrollmentSchema.safeParse({
        studentStatus: "normal",
        maxCredits: 25,
      }).success,
    ).toBe(true);
  });

  test("normal ลงทะเบียนเกิน 25 หน่วยกิตไม่ได้", () => {
    expect(
      enrollmentSchema.safeParse({
        studentStatus: "normal",
        maxCredits: 26,
      }).success,
    ).toBe(false);
  });

  test("probation ลงทะเบียน 22 หน่วยกิตได้", () => {
    expect(
      enrollmentSchema.safeParse({
        studentStatus: "probation",
        maxCredits: 22,
      }).success,
    ).toBe(true);
  });

  test("probation ลงทะเบียนเกิน 22 หน่วยกิตไม่ได้", () => {
    expect(
      enrollmentSchema.safeParse({
        studentStatus: "probation",
        maxCredits: 23,
      }).success,
    ).toBe(false);
  });
});
