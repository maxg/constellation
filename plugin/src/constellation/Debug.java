package constellation;

import static constellation.Util.assertNotNull;
import static constellation.Util.streamOnly;

import java.security.KeyManagementException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Arrays;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLPeerUnverifiedException;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import org.eclipse.core.runtime.Platform;
import org.eclipse.jdt.annotation.NonNull;
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jetty.util.ssl.SslContextFactory;

public class Debug {
    
    private static final boolean TRACING = "true".equals(Platform.getDebugOption(Activator.PLUGIN_ID + "/tracing"));
    
    private static @Nullable SSLContext INSECURE_SSL = null;
    
    /**
     * Announce the current method.
     */
    public static void trace(Object... args) {
        if ( ! TRACING) { return; }
        
        @NonNull StackTraceElement[] stack = Thread.currentThread().getStackTrace();
        System.out.println(clean(stack[2]) + (stack.length > 3 ? " <- " + clean(stack[3]): ""));
        if (args.length == 0) { return; }
        System.out.print("    " + args[0]);
        for (int ii = 1; ii < args.length; ii++) {
            System.out.print(", " + args[ii]);
        }
        System.out.println();
    }
    
    private static String clean(StackTraceElement point) {
        return point.toString()
                .replaceAll(Debug.class.getPackage().getName() + "(\\.[a-z]+)*\\.", "")
                .replaceAll("jdk.nashorn.internal.scripts.Script\\$(\\w+\\$)*", "[JavaScript]");
    }
    
    /**
     * Enable SSL connections using a snake-oil certificate.
     */
    public static void enableInsecureSSL() throws NoSuchAlgorithmException, KeyStoreException {
        Log.info("Enabling insecure SSL");
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init((KeyStore)null);
        Arrays.stream(tmf.getTrustManagers()).flatMap(streamOnly(X509TrustManager.class)).findFirst().ifPresent(tm -> {
            try {
                SSLContext ssl = assertNotNull(INSECURE_SSL = SSLContext.getInstance("SSL"),
                        "No SSL support");
                ssl.init(null, new TrustManager[] { getInsecureTrustManager(tm) }, null);
                HttpsURLConnection.setDefaultSSLSocketFactory(ssl.getSocketFactory());
            } catch (NoSuchAlgorithmException | KeyManagementException e) { }
        });
        HttpsURLConnection.setDefaultHostnameVerifier(getInsecureHostnameVerifier());
    }
    
    /**
     * Enable WebSocket SSL connections using snake-oil certificate.
     */
    public static void enableInsecureSSL(SslContextFactory ssl) {
        Log.info("Enabling insecure WebSocket SSL");
        ssl.setSslContext(INSECURE_SSL);
    }
    
    /**
     * Create a trust manager that accepts snake-oil certificate as valid.
     * @param tm delegate to the given trust manager for all other decisions
     */
    private static X509TrustManager getInsecureTrustManager(X509TrustManager tm) {
        return new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() {
                return tm.getAcceptedIssuers();
            }
            public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                tm.checkClientTrusted(chain, authType);
            }
            public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                if (chain[0].getSubjectDN().getName().contains("constellation")) {
                    Log.info("Allowing untrusted server " + chain[0].getSubjectDN());
                    return;
                }
                tm.checkServerTrusted(chain, authType);
            }
        };
    }
    
    /**
     * Create a hostname verifier that accepts snake-oil certificate for any host.
     */
    private static HostnameVerifier getInsecureHostnameVerifier() {
        return new HostnameVerifier() {
            private final HostnameVerifier verify = HttpsURLConnection.getDefaultHostnameVerifier();
            public boolean verify(String hostname, SSLSession session) {
                try {
                    if (session.getPeerPrincipal().getName().contains("constellation")) {
                        Log.info("Allowing mismatched hostname " + hostname + " vs. " + session.getPeerHost());
                        return true;
                    }
                } catch (SSLPeerUnverifiedException e) { }
                return verify.verify(hostname, session);
            }
        };
    }
}
