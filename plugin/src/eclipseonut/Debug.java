package eclipseonut;

import java.security.KeyManagementException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Arrays;

import javax.net.ssl.*;

public class Debug {
    
    /**
     * Enable SSL connections using a snake-oil certificate.
     */
    public static void enableInsecureSSL() throws NoSuchAlgorithmException, KeyStoreException {
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init((KeyStore)null);
        Arrays.stream(tmf.getTrustManagers()).filter(tm -> tm instanceof X509TrustManager).findFirst().ifPresent(tm -> {
            try {
                setInsecureTrustManager((X509TrustManager)tm);
            } catch (NoSuchAlgorithmException | KeyManagementException e) { }
        });
        setInsecureHostnameVerifier();
    }
    
    /**
     * Install a trust manager that accepts snake-oil certificate as valid.
     * @param tm delegate to the given trust manager for all other decisions
     */
    private static void setInsecureTrustManager(X509TrustManager tm) throws NoSuchAlgorithmException, KeyManagementException {
        SSLContext ssl;
        ssl = SSLContext.getInstance("SSL");
        ssl.init(null, new TrustManager[] { new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() {
                return tm.getAcceptedIssuers();
            }
            public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                tm.checkClientTrusted(chain, authType);
            }
            public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                if (chain[0].getSubjectDN().getName().contains("eclipseonut")) {
                    System.err.println("Allowing untrusted server " + chain[0].getSubjectDN());
                    return;
                }
                tm.checkServerTrusted(chain, authType);
            }
        } }, null);
        HttpsURLConnection.setDefaultSSLSocketFactory(ssl.getSocketFactory());
    }
    
    /**
     * Install a hostname verifier that accepts snake-oil certificate for any host.
     */
    private static void setInsecureHostnameVerifier() {
        HostnameVerifier verify = new HostnameVerifier() {
            private final HostnameVerifier verify = HttpsURLConnection.getDefaultHostnameVerifier();
            public boolean verify(String hostname, SSLSession session) {
                try {
                    if (session.getPeerPrincipal().getName().contains("eclipseonut")) {
                        System.err.println("Allowing mismatched hostname " + hostname + " vs. " + session.getPeerHost());
                        return true;
                    }
                } catch (SSLPeerUnverifiedException e) { }
                return verify.verify(hostname, session);
            }
        };
        HttpsURLConnection.setDefaultHostnameVerifier(verify);
    }
}
