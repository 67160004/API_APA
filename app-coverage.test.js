jest.mock("./db", () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

const pool = require("./db");
const request = require("supertest");
const app = require("./app");
const { hashPassword, generateToken } = require("./auth-helpers");

beforeEach(() => {
  pool.query.mockReset();
  pool.getConnection.mockReset();
});

describe("app.js branch coverage", () => {
  test("GET / ควรคืน 200", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Student API พร้อมใช้งาน");
  });

  test("requireJson ควรคืน 415 เมื่อ Content-Type ไม่ใช่ JSON", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "text/plain")
      .send("test");

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  describe("GET /api/v1/students", () => {
    test("ควรทำงานเมื่อระบุ major และ sort", async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 1, name: "Test", major: "IT" }]])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      const response = await request(app).get("/api/v1/students").query({
        major: "IT",
        page: 2,
        limit: 5,
        sort: "name",
        order: "desc",
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
    });

    test("ควรทำงานเมื่อไม่ระบุ major", async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 1, name: "Test", major: "IT" }]])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      const response = await request(app).get("/api/v1/students");

      expect(response.status).toBe(200);
      expect(response.body.pagination).toHaveProperty("totalPages");
    });

    test("ควรคืน 500 เมื่อ database error", async () => {
      pool.query.mockRejectedValueOnce(new Error("students query failed"));

      const response = await request(app).get("/api/v1/students");

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  describe("GET /api/v2/students", () => {
    test("ควรคืนข้อมูลนักศึกษา", async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, name: "Test" }]]);

      const response = await request(app).get("/api/v2/students");

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.items).toHaveLength(1);
    });

    test("ควรคืน 500 เมื่อ database error", async () => {
      pool.query.mockRejectedValueOnce(new Error("v2 database failed"));

      const response = await request(app).get("/api/v2/students");

      expect(response.status).toBe(500);
    });
  });

  describe("GET /api/v1/students/:id", () => {
    test("ควรคืน 200 เมื่อพบข้อมูล", async () => {
      pool.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Test Student",
            major: "IT",
            email: "test@example.com",
          },
        ],
      ]);

      const response = await request(app).get("/api/v1/students/1");

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(1);
    });

    test("ควรคืน 404 เมื่อไม่พบข้อมูล", async () => {
      pool.query.mockResolvedValueOnce([[]]);

      const response = await request(app).get("/api/v1/students/999");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    test("ควรคืน 500 เมื่อ database error", async () => {
      pool.query.mockRejectedValueOnce(new Error("student query failed"));

      const response = await request(app).get("/api/v1/students/1");

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/v1/students", () => {
    test("ควรคืน 400 เมื่อข้อมูลไม่ครบ", async () => {
      const response = await request(app).post("/api/v1/students").send({
        name: "Test",
        major: "IT",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("ควรคืน 409 เมื่อ email ซ้ำ", async () => {
      pool.query.mockRejectedValueOnce({
        code: "ER_DUP_ENTRY",
      });

      const response = await request(app).post("/api/v1/students").send({
        name: "Test",
        major: "IT",
        email: "duplicate@example.com",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DUPLICATE_EMAIL");
    });

    test("ควรคืน 500 เมื่อ database error อื่น", async () => {
      pool.query.mockRejectedValueOnce(new Error("insert failed"));

      const response = await request(app).post("/api/v1/students").send({
        name: "Test",
        major: "IT",
        email: "test@example.com",
      });

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/v1/students/:id/enrollments", () => {
    test("ควรคืน 404 เมื่อไม่พบรายวิชา", async () => {
      const connection = {
        beginTransaction: jest.fn(),
        query: jest.fn().mockResolvedValueOnce([[]]),
        rollback: jest.fn(),
        commit: jest.fn(),
        release: jest.fn(),
      };

      pool.getConnection.mockResolvedValueOnce(connection);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 999 });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
      expect(connection.rollback).toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalled();
    });

    test("ควรคืน 409 เมื่อที่นั่งเต็ม", async () => {
      const connection = {
        beginTransaction: jest.fn(),
        query: jest.fn().mockResolvedValueOnce([[{ seat_available: 0 }]]),
        rollback: jest.fn(),
        commit: jest.fn(),
        release: jest.fn(),
      };

      pool.getConnection.mockResolvedValueOnce(connection);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 1 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SEAT_FULL");
      expect(connection.rollback).toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalled();
    });

    test("ควรคืน 201 เมื่อลงทะเบียนสำเร็จ", async () => {
      const connection = {
        beginTransaction: jest.fn(),
        query: jest
          .fn()
          .mockResolvedValueOnce([[{ seat_available: 5 }]])
          .mockResolvedValueOnce([{}])
          .mockResolvedValueOnce([{}]),
        rollback: jest.fn(),
        commit: jest.fn(),
        release: jest.fn(),
      };

      pool.getConnection.mockResolvedValueOnce(connection);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 1 });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("ลงทะเบียนสำเร็จ");
      expect(connection.commit).toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalled();
    });

    test("ควรคืน 409 เมื่อมีการลงทะเบียนซ้ำ", async () => {
      const connection = {
        beginTransaction: jest.fn(),
        query: jest
          .fn()
          .mockResolvedValueOnce([[{ seat_available: 5 }]])
          .mockRejectedValueOnce({
            code: "ER_DUP_ENTRY",
          }),
        rollback: jest.fn(),
        commit: jest.fn(),
        release: jest.fn(),
      };

      pool.getConnection.mockResolvedValueOnce(connection);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 1 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("ALREADY_ENROLLED");
      expect(connection.rollback).toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalled();
    });

    test("ควรคืน 500 เมื่อเกิด database error", async () => {
      const connection = {
        beginTransaction: jest.fn(),
        query: jest.fn().mockRejectedValueOnce(new Error("enrollment failed")),
        rollback: jest.fn(),
        commit: jest.fn(),
        release: jest.fn(),
      };

      pool.getConnection.mockResolvedValueOnce(connection);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 1 });

      expect(response.status).toBe(500);
      expect(connection.rollback).toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/v1/students/:id", () => {
    test("ควรคืน 404 เมื่อไม่พบข้อมูลที่จะลบ", async () => {
      pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const token = generateToken({
        id: 1,
        email: "admin@example.com",
        role: "admin",
      });

      const response = await request(app)
        .delete("/api/v1/students/999")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    test("ควรคืน 200 เมื่อลบสำเร็จ", async () => {
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const token = generateToken({
        id: 1,
        email: "admin@example.com",
        role: "admin",
      });

      const response = await request(app)
        .delete("/api/v1/students/1")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("ลบข้อมูลสำเร็จ");
    });

    test("ควรคืน 500 เมื่อ database error", async () => {
      pool.query.mockRejectedValueOnce(new Error("delete failed"));

      const token = generateToken({
        id: 1,
        email: "admin@example.com",
        role: "admin",
      });

      const response = await request(app)
        .delete("/api/v1/students/1")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/v1/auth/register", () => {
    test("ควรคืน 400 เมื่อไม่ส่ง email และ password", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("ควรคืน 409 เมื่อ email ซ้ำ", async () => {
      pool.query.mockRejectedValueOnce({
        code: "ER_DUP_ENTRY",
      });

      const response = await request(app).post("/api/v1/auth/register").send({
        email: "duplicate@example.com",
        password: "Passw0rd!",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DUPLICATE_EMAIL");
    });

    test("ควรคืน 500 เมื่อ database error อื่น", async () => {
      pool.query.mockRejectedValueOnce(new Error("register failed"));

      const response = await request(app).post("/api/v1/auth/register").send({
        email: "error@example.com",
        password: "Passw0rd!",
      });

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    test("ควรคืน 400 เมื่อไม่ส่ง email และ password", async () => {
      const response = await request(app).post("/api/v1/auth/login").send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("ควรคืน 401 เมื่อ password ไม่ถูกต้อง", async () => {
      const passwordHash = await hashPassword("CorrectPass123!");

      pool.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            email: "wrong@example.com",
            password_hash: passwordHash,
            role: "student",
          },
        ],
      ]);

      const response = await request(app).post("/api/v1/auth/login").send({
        email: "wrong@example.com",
        password: "WrongPass123!",
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    test("ควรคืน 500 เมื่อ database error", async () => {
      pool.query.mockRejectedValueOnce(new Error("login database failed"));

      const response = await request(app).post("/api/v1/auth/login").send({
        email: "error@example.com",
        password: "Passw0rd!",
      });

      expect(response.status).toBe(500);
    });
  });

  test("ควรคืน 404 เมื่อเรียก route ที่ไม่มีอยู่", async () => {
    const response = await request(app).get("/route-that-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  test("ควรเข้า error handler branch ที่ไม่ใช่ 500 เมื่อ JSON ไม่ถูกต้อง", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("entity.parse.failed");
  });
});
