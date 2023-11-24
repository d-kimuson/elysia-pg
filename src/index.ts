import { Elysia, OptionalHandler, t } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { cookie } from "@elysiajs/cookie";
import { jwt as elysiaJwt } from "@elysiajs/jwt";
import { randomUUID } from "crypto";
import { swagger } from "@elysiajs/swagger";
import { writeFile } from "node:fs/promises";

type ArgsType<T> = T extends (...args: infer U) => any ? U : never;

const setup = new Elysia({
  name: "setup",
})
  .use(
    elysiaJwt({
      name: "jwt",
      secret: "見せられないよ",
      schema: t.Object({
        userId: t.String(),
      }),
    })
  )
  .use(cookie())
  .derive(async ({ jwt, cookie: { session } }) => {
    const emptySession = {
      session: undefined,
    };

    if (session === undefined) {
      return emptySession;
    }

    const verified = await jwt.verify(session);
    if (verified === false) return emptySession;
    return {
      session: verified,
    };
  })
  .on("beforeHandle", () => {
    console.log(`Request starts (${process.pid})`);
  })
  .on("afterHandle", () => {
    console.log(`Request ended (${process.pid})`);
  });

type Decorator = typeof setup extends Elysia<any, infer I> ? I : never;
type BeforeHandle = OptionalHandler<{}, Decorator>;

const publicRoute = setup.group("/public", (app) =>
  app.get("/hello", async () => "Hello Elysia", {
    detail: {
      summary: "Hello API",
      tags: ["public"],
      operationId: "publicHello",
    },
  })
);

const privateRoute = setup.group("/private", (app) =>
  app
    .on("beforeHandle", (arg) => {
      const { session, set } = arg as ArgsType<BeforeHandle>[0];

      if (session === undefined) {
        console.error("Unauthorized");
        set.status = 401;
        return "Unauthorized";
      }
    })
    .get(
      "/hello",
      async ({ session }) => {
        console.log("should not be called");
      },
      {
        detail: {
          summary: "hello api",
          tags: ["private"],
          operationId: "privateHello",
        },
      }
    )
);

const authRoute = setup.group("/auth", (app) =>
  app
    .post(
      "/signUp",
      async ({ setCookie, jwt, body, set }) => {
        const userId = randomUUID();

        setCookie("session", await jwt.sign({ userId }), {
          httpOnly: true,
          maxAge: 7 * 86400,
        });

        return {
          userId,
        };
      },
      {
        detail: {
          summary: "登録API",
          tags: ["auth"],
          operationId: "signUp",
        },
      }
    )
    .post(
      "/signIn",
      async ({ body, jwt, setCookie }) => {
        // password 検証しつつ
        setCookie("session", await jwt.sign({ userId: body.userId }), {
          httpOnly: true,
          maxAge: 7 * 86400,
        });

        return {
          userId: body.userId,
        };
      },
      {
        body: t.Object({
          userId: t.String({
            description: "ユーザーID",
          }),
          password: t.String({
            description: "パスワード",
          }),
        }),
        detail: {
          summary: "ログインAPI",
          tags: ["auth"],
          operationId: "signIn",
        },
      }
    )
    .post(
      "/signOut",
      async ({ removeCookie }) => {
        removeCookie("session");
      },
      {
        detail: {
          summary: "ログアウトAPI",
          tags: ["auth"],
          operationId: "signOut",
        },
      }
    )
);

const routes = [publicRoute, privateRoute, authRoute];

const app = routes
  .reduce((app, route) => app.use(route), new Elysia())
  .use(
    staticPlugin({
      assets: "public",
      prefix: "assets",
    })
  )
  .use(
    swagger({
      documentation: {
        info: {
          title: "Elysia Documentation",
          version: "1.0.0",
        },
      },
      path: "/swagger",
    })
  )
  .on("start", async () => {
    if (process.env.NODE_ENV === "production") return;

    const openapiSchema = await fetch(
      "http://localhost:3000/swagger/json"
    ).then((res) => res.json());
    await writeFile(
      "./swagger.json",
      JSON.stringify(openapiSchema, null, 2),
      "utf-8"
    );
    console.log('🦊 OpenAPI schema is updated at "./swagger.json"!');
  });

const main = async () => {
  if (typeof process.env.PORT !== "string")
    throw new Error("PORT env required.");

  app.listen(process.env.PORT);

  if (process.env.CLUSTER === "true") {
    console.log(`Starts cluster for ${process.pid}.`);
  } else {
    console.log(
      `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
    );
  }
};

main().catch((err) => {
  console.error("IndexError", err);
});
