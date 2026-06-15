package com.zoomy.api.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(prefix = "zoomy.proctor", name = "enabled", havingValue = "true")
public class KafkaTopicsConfig {

    @Bean
    NewTopic proctorEventsTopic(@Value("${zoomy.topics.proctor-events}") String name) {
        return new NewTopic(name, 3, (short) 1);
    }

    @Bean
    NewTopic alertsTopic(@Value("${zoomy.topics.alerts}") String name) {
        return new NewTopic(name, 3, (short) 1);
    }
}
