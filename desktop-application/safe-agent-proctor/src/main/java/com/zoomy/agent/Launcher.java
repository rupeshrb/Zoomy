package com.zoomy.agent;

/**
 * Plain entry point for packaged (jpackage / fat-jar) launches.
 *
 * <p>When the main class itself extends {@link javafx.application.Application}
 * and JavaFX is on the classpath (not the module path), the JVM refuses to start
 * with "JavaFX runtime components are missing". Delegating through a class that
 * does NOT extend {@code Application} sidesteps that check, so the native
 * executable produced by jpackage starts correctly.
 */
public final class Launcher {
    private Launcher() { }

    public static void main(String[] args) {
        SafeAgentApp.main(args);
    }
}
