<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html<#if realm.internationalizationEnabled> lang="${locale.currentLanguageTag}"</#if>>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#if authenticationSession??>
        <script type="importmap">
            {
                "imports": {
                    "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
                }
            }
        </script>
        <script type="module" src="${url.resourcesPath}/js/authChecker.js"></script>
    </#if>
</head>
<body class="login-pf kc-login">
    <div class="randonneur-wrapper">
        <div class="card-pf">
            <!-- Brand header -->
            <div class="randonneur-brand">
                <div class="randonneur-brand-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18.5" cy="17.5" r="3.5"/>
                        <circle cx="5.5" cy="17.5" r="3.5"/>
                        <circle cx="15" cy="5" r="1"/>
                        <path d="M12 17.5V14l-3.5-3.5 2-1.5 4 2 2.5-2.5"/>
                    </svg>
                </div>
                <h1 class="randonneur-brand-title">3chan Randonneur</h1>
                <p class="randonneur-brand-subtitle">${msg("brandSubtitle")}</p>
            </div>

            <!-- Locale selector -->
            <#if realm.internationalizationEnabled && locale.supported?size gt 1>
                <div id="kc-locale" style="text-align: right; margin-bottom: 0.5rem;">
                    <div id="kc-locale-wrapper">
                        <div id="kc-locale-dropdown">
                            <select onchange="window.location.href=this.value"
                                    style="font-size: 0.8125rem; padding: 0.25rem 0.5rem; border: 1px solid rgba(26,35,126,0.15); border-radius: 0.25rem; background: #fff; color: #0a0a0a; cursor: pointer;">
                                <#list locale.supported as l>
                                    <option value="${l.url}" <#if l.languageTag == locale.currentLanguageTag>selected</#if>>${l.label}</option>
                                </#list>
                            </select>
                        </div>
                    </div>
                </div>
            </#if>

            <!-- Page title -->
            <div id="kc-page-title">
                <#nested "header">
            </div>

            <!-- Alert messages -->
            <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                <div class="alert alert-${message.type}">
                    ${kcSanitize(message.summary)?no_esc}
                </div>
            </#if>

            <!-- Main form content -->
            <div id="kc-content">
                <div id="kc-content-wrapper">
                    <#nested "form">

                    <#if auth?has_content && auth.showTryAnotherWayLink()>
                        <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post">
                            <div>
                                <input type="hidden" name="tryAnotherWay" value="on"/>
                                <a href="#" id="try-another-way"
                                   onclick="document.forms['kc-select-try-another-way-form'].submit();return false;">
                                    ${msg("doTryAnotherWay")}
                                </a>
                            </div>
                        </form>
                    </#if>

                    <#if displayInfo>
                        <div id="kc-info">
                            <#nested "info">
                        </div>
                    </#if>
                </div>
            </div>
        </div>

        <!-- Footer link back to website -->
        <div class="randonneur-footer">
            <a href="https://randonneur.3chan.kr">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m15 18-6-6 6-6"/>
                </svg>
                ${msg("backToApplication")}
            </a>
        </div>
    </div>
</body>
</html>
</#macro>
