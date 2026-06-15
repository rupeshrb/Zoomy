package com.zoomy.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.data.mongo.MongoDataAutoConfiguration;
import org.springframework.boot.autoconfigure.data.mongo.MongoRepositoriesAutoConfiguration;

/**
 * We declare per-context MongoTemplates manually (see {@link com.zoomy.api.common.MongoMultiDbConfig})
 * and enable each context's @EnableMongoRepositories explicitly. We still let Spring Boot
 * autoconfigure the MongoClient + connection settings from spring.data.mongodb.uri,
 * but skip the default global MongoTemplate / repository scanning.
 */
@SpringBootApplication(exclude = {
    MongoDataAutoConfiguration.class,
    MongoRepositoriesAutoConfiguration.class
})
public class ZoomyApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(ZoomyApiApplication.class, args);
    }
}
