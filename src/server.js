import app from "./app.js";
import connectDb from "./config/db.config.js";
import env from "./config/env.config.js";

const startServer = async () => {
  try {
    await connectDb();

    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Server startup failed", error);
    process.exit(1);
  }
};

startServer();