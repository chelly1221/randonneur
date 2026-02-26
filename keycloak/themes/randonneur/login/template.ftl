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
    <script>
      document.addEventListener("DOMContentLoaded", function () {
        var pageLang = (document.documentElement.lang || "").toLowerCase();
        if (pageLang.indexOf("ko") === 0) {
          var googleLabel = document.querySelector("#social-google .kc-social-provider-name");
          if (googleLabel) {
            googleLabel.textContent = "구글";
          }
          var naverLabel = document.querySelector("#social-naver .kc-social-provider-name");
          if (naverLabel) {
            naverLabel.textContent = "네이버";
          }
        }

        // Inject Naver logo icon (SPI doesn't generate kc-social-provider-logo for custom providers)
        var naverBtn = document.getElementById("social-naver");
        if (naverBtn && !naverBtn.querySelector(".kc-social-provider-logo")) {
          var icon = document.createElement("i");
          icon.className = "kc-social-provider-logo";
          icon.setAttribute("aria-hidden", "true");
          naverBtn.insertBefore(icon, naverBtn.firstChild);
        }

        // -- Update-profile form (shown after social login) --
        var updateForm = document.getElementById("kc-update-profile-form");
        if (updateForm) {
          var upFirstName = updateForm.querySelector('input[name="firstName"]');
          var upLastName = updateForm.querySelector('input[name="lastName"]');
          var upFirstLabel = updateForm.querySelector('label[for="firstName"]');

          // Merge existing lastName + firstName into nickname
          if (upFirstName) {
            var existingLast = (upLastName && upLastName.value.trim()) || "";
            var existingFirst = upFirstName.value.trim();
            var merged = (existingLast + existingFirst).trim();
            if (merged) {
              upFirstName.value = merged;
            }
          }

          // Relabel firstName as Nickname
          if (upFirstLabel) {
            upFirstLabel.textContent = "${msg("nickname")}";
          }
          if (upFirstName) {
            upFirstName.setAttribute("placeholder", "${msg("nickname")}");
          }

          // Hide lastName field
          if (upLastName) {
            var upLastGroup = upLastName.closest(".form-group")
              || upLastName.closest(".pf-c-form__group");
            if (upLastGroup) {
              upLastGroup.style.display = "none";
            }
          }

          // Sync lastName on submit
          function syncUpdateLastName() {
            if (!upLastName) return;
            var nick = upFirstName ? upFirstName.value.trim() : "";
            upLastName.value = nick || "user";
            upLastName.required = false;
          }
          syncUpdateLastName();
          if (upFirstName) {
            upFirstName.addEventListener("input", syncUpdateLastName);
          }
          updateForm.addEventListener("submit", syncUpdateLastName);
        }

        var registerForm = document.getElementById("kc-register-form");
        if (!registerForm) return;

        registerForm.classList.add("randonneur-register-form");

        var firstNameInput = registerForm.querySelector('input[name="firstName"]');
        var lastNameInput = registerForm.querySelector('input[name="lastName"]');
        var firstNameLabel = registerForm.querySelector('label[for="firstName"]');

        if (firstNameLabel) {
          firstNameLabel.textContent = "${msg("nickname")}";
        }
        if (firstNameInput) {
          firstNameInput.setAttribute("placeholder", "${msg("nickname")}");
          firstNameInput.setAttribute("autocomplete", "nickname");
        }

        function syncLastName() {
          if (!lastNameInput) return;
          var nick = firstNameInput ? firstNameInput.value.trim() : "";
          lastNameInput.value = nick || "user";
          lastNameInput.required = false;
        }

        if (lastNameInput) {
          var lastNameGroup = lastNameInput.closest(".form-group")
            || lastNameInput.closest(".pf-c-form__group")
            || lastNameInput.closest(".col-xs-6")
            || lastNameInput.closest(".col-sm-6");
          if (lastNameGroup) {
            lastNameGroup.style.display = "none";
          }
          syncLastName();
        }

        if (firstNameInput) {
          firstNameInput.addEventListener("input", syncLastName);
        }
        registerForm.addEventListener("submit", syncLastName);

        // Remove plain text-node asterisks rendered beside required labels.
        var labelRows = registerForm.querySelectorAll(".form-group > div, .pf-c-form__group > div");
        for (var r = 0; r < labelRows.length; r++) {
          var row = labelRows[r];
          if (!row.querySelector("label")) continue;
          for (var c = row.childNodes.length - 1; c >= 0; c--) {
            var node = row.childNodes[c];
            if (node.nodeType !== Node.TEXT_NODE) continue;
            var txt = (node.textContent || "").trim();
            if (txt === "*") {
              row.removeChild(node);
            }
          }
        }

        // Hide the register-page required-fields legend (e.g. "* 필수 입력 항목")
        var requiredLegendText = "${msg("requiredFields")}".toLowerCase();
        var legendCandidates = registerForm.querySelectorAll("div, span, p");
        for (var i = 0; i < legendCandidates.length; i++) {
          var el = legendCandidates[i];
          if (el.querySelector("input, select, textarea, button")) continue;
          var text = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (!text) continue;
          var looksLikeRequiredLegend =
            text.indexOf("*") !== -1 &&
            (text.indexOf(requiredLegendText) !== -1 ||
             text.indexOf("required") !== -1 ||
             text.indexOf("필수") !== -1);
          if (looksLikeRequiredLegend) {
            el.style.display = "none";
          }
        }
      });
    </script>
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

                    <#nested "socialProviders">

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
