package constellation;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Stream;

import org.eclipse.core.runtime.Assert;
import org.eclipse.jdt.annotation.NonNull;
import org.eclipse.jdt.annotation.Nullable;

/**
 * Various utilities.
 */
public interface Util {
    
    /**
     * Assert that a value is non-null.
     * @param object to check
     * @param message exception detail message if object is null
     * @return object if non-null
     * @throws NullPointerException if object is null
     */
    public static <T> @NonNull T assertNotNull(@Nullable T object, String message) throws NullPointerException {
        if (object == null) { throw new NullPointerException(message); }
        return object;
    }
    
    /**
     * Call a function if non-null.
     * @param maybe function to call
     */
    public static <T> void callIfNotNull(@Nullable Runnable maybe) {
        if (maybe != null) { maybe.run(); }
    }
    
    /**
     * Call a function if non-null.
     * @param maybe function to call
     * @param arg argument
     */
    public static <T> void callIfNotNull(@Nullable Consumer<T> maybe, T arg) {
        if (maybe != null) { maybe.accept(arg); }
    }
    
    /**
     * Start a new thread.
     * @param target parameter to Thread constructor
     * @return the new started thread
     */
    public static Thread startThread(Runnable target) {
        Thread t = new Thread(target);
        t.start();
        return t;
    }
    
    /**
     * Create a {@link Stream#flatMap} mapper for filtering elements by type.
     * @param subtype type to filter for
     * @return function f(e) = if (e instanceof subtype) then [ e ] else []
     */
    @SuppressWarnings("unchecked")
    public static <T, U extends T> Function<T, Stream<U>> streamOnly(Class<U> subtype) {
        return t -> subtype.isInstance(t) ? Stream.of((U)t) : Stream.empty();
    }
    
    /**
     * Create a {@code Map<String, String>}.
     * @param keysValues key_0, value_0, key_1, value_1, ...
     * @return { key_0 => value_0, key_1 => value_1, ... }
     */
    public static Map<String, String> stringMap(@NonNull String... keysValues) {
        Assert.isTrue(keysValues.length % 2 == 0);
        Map<String, String> map = new HashMap<>();
        for (int idx = 0; idx < keysValues.length; idx += 2) {
            map.put(keysValues[idx], keysValues[idx+1]);
        }
        return map;
    }
}
