# Contexte de build : racine du dépôt (voir docker-compose.yml).
# Versions figées volontairement : Java 8, Struts 1.3.10, Tomcat 9.

# 1. tomcat-users.xml généré depuis le fichier des utilisateurs (ADR 0003).
FROM node:22.23.5-alpine AS users
WORKDIR /work
COPY fixtures/users.json users.json
COPY scripts/users.ts scripts/generate-tomcat-users.ts ./
RUN node --experimental-strip-types generate-tomcat-users.ts users.json tomcat-users.xml

# 2. Build Maven du war.
# Dépôt Maven local dans un cache de BuildKit, hors de l'image : en CI,
# scripts/maven-cache.sh y verse le dépôt gardé d'une exécution à l'autre,
# pour ne pas dépendre de Maven Central à chaque construction (#149). L'id du
# cache est celui du script.
FROM maven:3.9.16-eclipse-temurin-8 AS build
WORKDIR /build
COPY fixtures/legacy-app/pom.xml pom.xml
RUN --mount=type=cache,id=migrabench-maven-repository,target=/root/.m2/repository,sharing=locked \
    mvn -B -q dependency:go-offline
COPY fixtures/legacy-app/src src
RUN --mount=type=cache,id=migrabench-maven-repository,target=/root/.m2/repository,sharing=locked \
    mvn -B -q package

# 3. Tomcat 9 sur JDK 8.
FROM tomcat:9.0.124-jdk8-temurin
RUN rm -rf /usr/local/tomcat/webapps/*
COPY --from=users /work/tomcat-users.xml /usr/local/tomcat/conf/tomcat-users.xml
COPY --from=build /build/target/ROOT.war /usr/local/tomcat/webapps/ROOT.war
# Second connecteur : 8081 pour l'API interne, non publié sur l'hôte. Dans
# la composition, il n'écoute que sur l'adresse du legacy dans mb-internal,
# nommée par la propriété système mb.internalApiAddress (docker-compose.yml) :
# un conteneur du réseau default ne le joint pas (ADR 0004, #78). Sans la
# propriété (image lancée seule), il écoute sur toutes les interfaces.
# Le grep fait échouer le build si l'insertion rate.
RUN sed -i 's|<Connector port="8080" protocol="HTTP/1.1"|<Connector port="8081" address="${mb.internalApiAddress:-0.0.0.0}" protocol="HTTP/1.1" connectionTimeout="20000" maxParameterCount="1000" />\n    &|' conf/server.xml \
 && grep -q '<Connector port="8081" address="${mb.internalApiAddress:-0.0.0.0}"' conf/server.xml
# Journal d'accès du banc (#67), instrumentation et non piège (TRAPS.md) :
# connecteur 8080 seul, en ajout dans logs/migrabench/access.log, que le banc
# monte depuis l'hôte (docker-compose.yml). UMASK 0022 : Tomcat crée ses
# journaux en 0640 par défaut, illisibles pour le runner sur un hôte Linux.
ENV UMASK=0022
COPY fixtures/legacy-app/access-log/rewrite.config conf/Catalina/localhost/rewrite.config
COPY fixtures/legacy-app/access-log/access-log-valve.xml /tmp/access-log-valve.xml
RUN sed -i '/<\/Host>/e cat /tmp/access-log-valve.xml' conf/server.xml \
 && rm /tmp/access-log-valve.xml \
 && grep -q 'conditionUnless="mbInternalApi"' conf/server.xml
EXPOSE 8080 8081
