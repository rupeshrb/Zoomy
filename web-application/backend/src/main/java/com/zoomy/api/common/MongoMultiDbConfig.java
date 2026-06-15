package com.zoomy.api.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;

import com.mongodb.client.MongoClient;

/**
 * Multi-database Mongo wiring: one physical cluster, separate DBs per bounded context.
 * Each MongoTemplate bean is consumed by a per-context @EnableMongoRepositories config.
 *
 *   zoomy_auth     -> users, refresh_tokens          (auth-service ready)
 *   zoomy_meeting  -> meetings, participants         (meeting-service ready)
 *   zoomy_proctor  -> events, alerts (TTL indexes)   (proctor-service ready)
 *   zoomy_chat     -> messages (TTL indexes)         (chat-service ready)
 */
@Configuration
public class MongoMultiDbConfig {

    @Bean(name = "authMongoTemplate")
    @Primary
    public MongoTemplate authMongoTemplate(MongoClient client,
                                           @Value("${zoomy.databases.auth}") String db) {
        return template(client, db);
    }

    @Bean(name = "meetingMongoTemplate")
    public MongoTemplate meetingMongoTemplate(MongoClient client,
                                              @Value("${zoomy.databases.meeting}") String db) {
        return template(client, db);
    }

    @Bean(name = "proctorMongoTemplate")
    public MongoTemplate proctorMongoTemplate(MongoClient client,
                                              @Value("${zoomy.databases.proctor}") String db) {
        return template(client, db);
    }

    @Bean(name = "chatMongoTemplate")
    public MongoTemplate chatMongoTemplate(MongoClient client,
                                           @Value("${zoomy.databases.chat}") String db) {
        return template(client, db);
    }

    private MongoTemplate template(MongoClient client, String db) {
        MongoDatabaseFactory factory = new SimpleMongoClientDatabaseFactory(client, db);
        return new MongoTemplate(factory);
    }
}
