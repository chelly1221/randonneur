package kr.chan3.keycloak.social.naver;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.core.Response;
import org.keycloak.broker.oidc.AbstractOAuth2IdentityProvider;
import org.keycloak.broker.oidc.mappers.AbstractJsonUserAttributeMapper;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.broker.provider.IdentityBrokerException;
import org.keycloak.broker.provider.util.SimpleHttp;
import org.keycloak.broker.social.SocialIdentityProvider;
import org.keycloak.events.EventBuilder;
import org.keycloak.models.KeycloakSession;

public class NaverIdentityProvider
        extends AbstractOAuth2IdentityProvider<NaverIdentityProviderConfig>
        implements SocialIdentityProvider<NaverIdentityProviderConfig> {

    public static final String AUTH_URL = "https://nid.naver.com/oauth2.0/authorize";
    public static final String TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
    public static final String PROFILE_URL = "https://openapi.naver.com/v1/nid/me";
    public static final String DEFAULT_SCOPE = "";

    public NaverIdentityProvider(KeycloakSession session, NaverIdentityProviderConfig config) {
        super(session, config);
        config.setAuthorizationUrl(AUTH_URL);
        config.setTokenUrl(TOKEN_URL);
        config.setUserInfoUrl(PROFILE_URL);
    }

    @Override
    protected String getDefaultScopes() {
        return DEFAULT_SCOPE;
    }

    @Override
    protected boolean supportsExternalExchange() {
        return true;
    }

    @Override
    protected BrokeredIdentityContext doGetFederatedIdentity(String accessToken) {
        try {
            JsonNode jsonNode = SimpleHttp.doGet(PROFILE_URL, session)
                    .header("Authorization", "Bearer " + accessToken)
                    .asJson();

            return extractIdentityFromProfile(null, jsonNode);
        } catch (Exception e) {
            throw new IdentityBrokerException("Could not obtain user profile from Naver.", e);
        }
    }

    @Override
    protected BrokeredIdentityContext extractIdentityFromProfile(EventBuilder event, JsonNode profile) {
        // Naver wraps the actual profile in a "response" object:
        // {"resultcode":"00","message":"success","response":{"id":"...","email":"...",...}}
        JsonNode response = profile.get("response");
        if (response == null) {
            throw new IdentityBrokerException("Naver profile response is missing 'response' field.");
        }

        String id = getJsonStringProperty(response, "id");
        if (id == null || id.isEmpty()) {
            throw new IdentityBrokerException("Naver profile is missing 'id' field.");
        }

        BrokeredIdentityContext user = new BrokeredIdentityContext(id, getConfig());

        String email = getJsonStringProperty(response, "email");
        String name = getJsonStringProperty(response, "name");
        String nickname = getJsonStringProperty(response, "nickname");
        String profileImage = getJsonStringProperty(response, "profile_image");

        // Use nickname as display name fallback
        String displayName = name != null && !name.isEmpty() ? name : nickname;

        user.setIdp(this);
        user.setId(id);
        user.setEmail(email);
        user.setUsername(email != null && !email.isEmpty() ? email : id);

        if (displayName != null && !displayName.isEmpty()) {
            user.setFirstName(displayName);
            user.setLastName("");
        }

        if (nickname != null && !nickname.isEmpty()) {
            user.setUserAttribute("nickname", nickname);
        }

        if (profileImage != null && !profileImage.isEmpty()) {
            user.setUserAttribute("picture", profileImage);
        }

        AbstractJsonUserAttributeMapper.storeUserProfileForMapper(user, profile, getConfig().getAlias());

        return user;
    }

    private String getJsonStringProperty(JsonNode jsonNode, String name) {
        if (jsonNode == null || !jsonNode.has(name) || jsonNode.get(name).isNull()) {
            return null;
        }
        return jsonNode.get(name).asText();
    }
}
