import os from "node:os";

const numCPUs = os.cpus().length;

const main = async () => {
  console.log(
    `🦊 Elysia is running at ${process.env.PORT} port with ${numCPUs} processes`
  );

  for (let i = 0; i < numCPUs; i++) {
    Bun.spawn(["bun", "./src/index.ts"], {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env },
    });
  }
};

main().catch((err) => {
  console.error("SpawnError", err);
});
