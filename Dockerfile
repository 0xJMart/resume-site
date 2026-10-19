# dist/ is built in CI (Astro build + Playwright renders); the image only serves it.
FROM nginxinc/nginx-unprivileged:1.30-alpine
ENV STATUS_URL=http://rack-display-status.rack-display.svc.cluster.local/public/status \
    RESOLVER=kube-dns.kube-system.svc.cluster.local
COPY deploy/default.conf.template /etc/nginx/templates/default.conf.template
COPY dist/ /usr/share/nginx/html/
EXPOSE 8080
