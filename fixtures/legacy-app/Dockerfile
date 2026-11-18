# Contexte de build : racine du dépôt (voir docker-compose.yml).
# Versions figées volontairement : Java 8, Struts 1.3.10, Tomcat 9.

# 1. tomcat-users.xml généré depuis le fichier des utilisateurs (ADR 0003).
FROM node:22.23.5-alpine AS users
WORKDIR /work
COPY fixtures/users.json users.json
COPY scripts/users.ts scripts/generate-tomcat-users.ts ./
RUN node --experimental-strip-types generate-tomcat-users.ts users.json tomcat-users.xml

# 2. Build Maven du war.
FROM maven:3.9.16-eclipse-temurin-8 AS build
WORKDIR /build
COPY fixtures/legacy-app/pom.xml pom.xml
RUN mvn -B -q dependency:go-offline
COPY fixtures/legacy-app/src src
RUN mvn -B -q package

# 3. Tomcat 9 sur JDK 8.
FROM tomcat:9.0.124-jdk8-temurin
RUN rm -rf /usr/local/tomcat/webapps/*
COPY --from=users /work/tomcat-users.xml /usr/local/tomcat/conf/tomcat-users.xml
COPY --from=build /build/target/ROOT.war /usr/local/tomcat/webapps/ROOT.war
EXPOSE 8080
