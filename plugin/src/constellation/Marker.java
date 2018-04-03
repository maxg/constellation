package constellation;

import java.util.Objects;

public class Marker {

    /**
     * Line number of marker starting from 1.
     */
    public final int lineNumber;

    /**
     * Message associated with this marker.
     */
    public final String message;

    /**
     * Severity corresponding to {@link org.eclipse.core.resources.IMarker.SEVERITY}.
     */
    public final int severity;

    public Marker(int lineNumber, String message, int severity) {
        this.lineNumber = lineNumber;
        this.message = message;
        this.severity = severity;
    }

    @Override
    public boolean equals(Object that) {
        return that instanceof Marker && sameValue((Marker) that);
    }

    private boolean sameValue(Marker that) {
        return this.lineNumber == that.lineNumber && this.message.equals(that.message) && this.severity == that.severity;
    }

    @Override
    public int hashCode() {
        return Objects.hash(lineNumber, message, severity);
    }

    @Override
    public String toString() {
        return "Marker[lineNumber=" + lineNumber + ", message=" + message + ", severity=" + severity + "]";
    }

}
