package com.zoomy.api.auth;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@Configuration
@EnableMongoRepositories(
    basePackageClasses = { UserRepository.class },
    mongoTemplateRef = "authMongoTemplate"
)
public class AuthMongoConfig {}
