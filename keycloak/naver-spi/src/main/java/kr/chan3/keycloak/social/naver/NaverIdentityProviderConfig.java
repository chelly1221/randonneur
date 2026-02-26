package kr.chan3.keycloak.social.naver;

import org.keycloak.broker.oidc.OAuth2IdentityProviderConfig;
import org.keycloak.models.IdentityProviderModel;

public class NaverIdentityProviderConfig extends OAuth2IdentityProviderConfig {

    public NaverIdentityProviderConfig(IdentityProviderModel model) {
        super(model);
    }

    public NaverIdentityProviderConfig() {
        super();
    }
}
