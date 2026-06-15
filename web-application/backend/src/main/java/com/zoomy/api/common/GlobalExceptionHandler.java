package com.zoomy.api.common;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

/**
 * Single place that turns exceptions into a consistent JSON error envelope:
 * <pre>{ status, error, path, timestamp, [details], [traceId] }</pre>
 *
 * Expected/domain errors surface their message; unexpected ones are logged with
 * a correlation id and return a generic message so internal details never leak
 * to clients (OWASP A04/A09).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Domain-level errors thrown deliberately by services/controllers. */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException ex, HttpServletRequest req) {
        return build(ex.status(), ex.getMessage(), null, req);
    }

    /** @Valid body validation failures — report the offending fields. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        Map<String, String> fields = new HashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.put(fe.getField(), fe.getDefaultMessage());
        }
        return build(400, "Validation failed", fields, req);
    }

    /** @Validated param/path validation failures. */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraint(ConstraintViolationException ex, HttpServletRequest req) {
        return build(400, "Validation failed", ex.getMessage(), req);
    }

    /** Malformed or missing JSON request body. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException ex, HttpServletRequest req) {
        return build(400, "Malformed or missing request body", null, req);
    }

    /** Missing required query/form parameter. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParam(MissingServletRequestParameterException ex, HttpServletRequest req) {
        return build(400, "Missing required parameter: " + ex.getParameterName(), null, req);
    }

    /** Wrong type for a path/query parameter (e.g. text where a number is expected). */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex, HttpServletRequest req) {
        return build(400, "Invalid value for parameter: " + ex.getName(), null, req);
    }

    /** HTTP verb not supported on this endpoint. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleMethod(HttpRequestMethodNotSupportedException ex, HttpServletRequest req) {
        return build(405, "Method not allowed", null, req);
    }

    /** Unmapped route / missing static resource. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(NoResourceFoundException ex, HttpServletRequest req) {
        return build(404, "Resource not found", null, req);
    }

    /** Authenticated but not allowed (method security). */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex, HttpServletRequest req) {
        return build(403, "Access denied", null, req);
    }

    /** Anything unexpected: log full detail server-side, return a generic message + traceId. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAll(Exception ex, HttpServletRequest req) {
        String traceId = UUID.randomUUID().toString();
        log.error("Unhandled exception [traceId={}] {} {}", traceId, req.getMethod(), req.getRequestURI(), ex);
        Map<String, Object> body = baseBody(500, "Something went wrong. Please try again.", req);
        body.put("traceId", traceId);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    private ResponseEntity<Map<String, Object>> build(int status, String msg, Object details, HttpServletRequest req) {
        Map<String, Object> body = baseBody(status, msg, req);
        if (details != null) body.put("details", details);
        return ResponseEntity.status(status).body(body);
    }

    private Map<String, Object> baseBody(int status, String msg, HttpServletRequest req) {
        Map<String, Object> body = new HashMap<>();
        body.put("status", status);
        body.put("error", msg == null ? "Error" : msg);
        body.put("timestamp", Instant.now().toString());
        if (req != null) body.put("path", req.getRequestURI());
        return body;
    }
}
