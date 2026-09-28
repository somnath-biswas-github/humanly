FROM node:20-alpine AS runner
WORKDIR /opt/humanly
ENV NODE_ENV=production

# The release includes a server bundle, so a clean Docker build has no package
# manager or registry dependency.
COPY dist/server.cjs ./server.cjs
COPY migrations ./migrations
COPY LICENSE COPYING ./

# Writable mount point for future file-backed test artifacts.
RUN mkdir -p /opt/humanly/uploads && chown -R node:node /opt/humanly/uploads

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.cjs"]
