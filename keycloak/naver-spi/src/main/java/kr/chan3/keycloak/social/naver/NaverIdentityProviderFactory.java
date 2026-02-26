package kr.chan3.keycloak.social.naver;

import org.keycloak.broker.provider.AbstractIdentityProviderFactory;
import org.keycloak.broker.social.SocialIdentityProviderFactory;
import org.keycloak.models.IdentityProviderModel;
import org.keycloak.models.KeycloakSession;

public class NaverIdentityProviderFactory
        extends AbstractIdentityProviderFactory<NaverIdentityProvider>
        implements SocialIdentityProviderFactory<NaverIdentityProvider> {

    public static final String PROVIDER_ID = "naver";

    @Override
    public String getName() {
        return "Naver";
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public NaverIdentityProvider create(KeycloakSession session, IdentityProviderModel model) {
        return new NaverIdentityProvider(session, new NaverIdentityProviderConfig(model));
    }

    @Override
    public NaverIdentityProviderConfig createConfig() {
        return new NaverIdentityProviderConfig();
    }
}
