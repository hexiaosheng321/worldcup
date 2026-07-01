import { onRequest as handleApiRequest } from "./functions/api/[[path]].js";

export default {
  async fetch(request, env, ctx) {
    return handleApiRequest({ request, env, ctx });
  },
};
