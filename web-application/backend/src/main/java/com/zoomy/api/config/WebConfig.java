package com.zoomy.api.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpStatus;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;

import com.zoomy.api.auth.JwtAuthFilter;
import com.zoomy.api.common.ratelimit.RateLimitFilter;
import com.zoomy.api.common.ratelimit.RedisRateLimiter;

@Configuration
@EnableWebSecurity
@EnableWebSocketMessageBroker
public class WebConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtAuthFilter jwtFilter;

    @Value("${zoomy.cors.allowed-origins}")
    private List<String> allowedOriginPatterns;

    public WebConfig(JwtAuthFilter jwtFilter) { this.jwtFilter = jwtFilter; }

    /**
     * Register the Redis-backed rate limiter ahead of the Spring Security chain
     * (highest precedence) so floods are rejected before any auth work happens.
     */
    @Bean
    public FilterRegistrationBean<RateLimitFilter> rateLimitFilter(
            RedisRateLimiter limiter,
            @Value("${zoomy.ratelimit.enabled:true}") boolean enabled,
            @Value("${zoomy.ratelimit.auth.limit:10}") int authLimit,
            @Value("${zoomy.ratelimit.auth.window-seconds:60}") int authWindow,
            @Value("${zoomy.ratelimit.api.limit:150}") int apiLimit,
            @Value("${zoomy.ratelimit.api.window-seconds:60}") int apiWindow) {
        FilterRegistrationBean<RateLimitFilter> reg = new FilterRegistrationBean<>(
            new RateLimitFilter(limiter, enabled, authLimit, authWindow, apiLimit, apiWindow));
        reg.addUrlPatterns("/api/*");
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return reg;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOriginPatterns(allowedOriginPatterns);
        cfg.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setExposedHeaders(List.of("Authorization"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/**", cfg);
        return src;
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http) throws Exception {
        http
            .cors(c -> c.configurationSource(corsConfigurationSource()))
            .csrf(c -> c.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers(
                    "/api/auth/signup",
                    "/api/auth/login",
                    "/api/auth/refresh",
                    "/api/meetings/resolve",
                    "/api/public/**",
                    "/ws/**",
                    "/actuator/**",
                    "/health"
                ).permitAll()
                .anyRequest().authenticated())
            // Return 401 (not the Spring default 403) when a request is unauthenticated
            // or carries an expired/invalid token, so the SPA's refresh-and-retry kicks in.
            .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .httpBasic(b -> b.disable())
            .formLogin(f -> f.disable())
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*").withSockJS();
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*");
    }
}
