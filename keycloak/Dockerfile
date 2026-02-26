# Stage 1: Build Naver SPI JAR with Maven
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY naver-spi/pom.xml .
RUN mvn dependency:go-offline -B
COPY naver-spi/src ./src
RUN mvn package -B -DskipTests

# Stage 2: Keycloak with Naver SPI
FROM quay.io/keycloak/keycloak:26.0 AS keycloak
COPY --from=builder /build/target/naver-social-identity-provider-*.jar /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build
