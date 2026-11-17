import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { prisma } from "./utils/db.js";
import { routeInscription } from "./routes/auth/inscription.js";
import { routeConnexion } from "./routes/auth/connexion.js";
import { routeMoi } from "./routes/auth/moi.js";
import { routeDeconnexion } from "./routes/auth/deconnexion.js";
import { routeListeTimbres } from "./routes/timbres/index.get.js";
import { routeDetailTimbre } from "./routes/timbres/id.get.js";
import multipart from "@fastify/multipart";
import { routeCreerTimbre } from "./routes/timbres/index.post.js";
import { routeModifierTimbre } from "./routes/timbres/id.patch.js";
import { routeSupprimerTimbre } from "./routes/timbres/id.delete.js";
import { routeMesTimbres } from "./routes/moi/timbres.get.js";
import { routeCreerEchange } from "./routes/echanges/index.post.js";
import { routeListeEchanges } from "./routes/echanges/index.get.js";
import { routeDetailEchange } from "./routes/echanges/id.get.js";
import { routeAccepterEchange } from "./routes/echanges/[id]/accepter.post.js";
const fastify = Fastify({
  logger: true,
});

await fastify.register(cookie);
await fastify.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
  },
});

await fastify.register(routeInscription);
await fastify.register(routeConnexion);
await fastify.register(routeMoi);
await fastify.register(routeDeconnexion);
await fastify.register(routeListeTimbres);
await fastify.register(routeDetailTimbre);
await fastify.register(routeCreerTimbre);
await fastify.register(routeModifierTimbre);
await fastify.register(routeSupprimerTimbre);
await fastify.register(routeMesTimbres);
await fastify.register(routeCreerEchange);
await fastify.register(routeListeEchanges);
await fastify.register(routeDetailEchange);
await fastify.register(routeAccepterEchange);

fastify.get("/", async () => {
  return {
    message: "Backend Fastify opérationnel",
  };
});

fastify.get("/test-db", async () => {
  const total = await prisma.timbre.count();

  return {
    connexion: "OK",
    totalTimbres: total,
  };
});

const demarrer = async () => {
  try {
    await fastify.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  } catch (erreur) {
    fastify.log.error(erreur);
    process.exit(1);
  }
};

demarrer();
