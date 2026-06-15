package com.zoomy.api.meeting;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@Configuration
@EnableMongoRepositories(
    basePackageClasses = MeetingRepository.class,
    mongoTemplateRef = "meetingMongoTemplate"
)
public class MeetingMongoConfig {}
