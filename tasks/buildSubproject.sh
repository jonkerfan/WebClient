#!/usr/bin/env bash
set -eo pipefail

IS_REMOTE=false;
LOG_PATH="$(pwd)/build.log";
MAIN_ARGS=$@;

function log {
    echo "$1" >&2;
    echo "$1" >> "$LOG_PATH";
}

function loadEnv {
    set -o allexport
    source "$1";
    set +o allexport
}

if [ -f "env/.env" ]; then
    loadEnv "env/.env";
    echo ""
    echo "⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠ [DEPRECATION NOTICE] ⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠"
    echo " Plz copy your file env/.env to the .env"
    echo "⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠ [/DEPRECATION NOTICE] ⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠"

    echo ""
    echo ""
fi;

if [ -f ".env" ]; then
    loadEnv ".env";
fi;

if [ -z "$ROOT_DIR" ]; then
    echo "Missing [ROOT_DIR] inside env/.env file, to create one plz open the link below";
    echo "You will find inside an ex of the config."
    echo "https://github.com/ProtonMail/protonmail-settings#where-should-i-should-i-clone-them-"
    echo '  - You can debug via using export ROOT_DIR="$(pwd)"'
    echo
    exit 1;
fi;

WEBCLIENT_DIR="$ROOT_DIR/${WEBCLIENT_APP:-Angular}";

# Extract API flag and fallback default if it doesn't exist
API_FLAG=$(echo "$@" | awk 'match($0, /--api=(\w{3,4})/) {
    print substr($0, RSTART, RLENGTH)
}' | awk -F '=' '{print $2}');
API="${API_FLAG:-build}";

# Output dir where we will store the dist version of protonmail-settings.
# dist/settings will allow us to access to mail.protonmail.com/settings with protonmail-settings
SETTINGS_DIST_DIR="dist/settings";
CONTACTS_DIST_DIR="dist/contacts";
CALENDAR_DIST_DIR="dist/calendar";
GIT_SUBPROJECT_URL="";
ARGS="$*";


log "[sub.build] $(date) MAIN_ARGS: $MAIN_ARGS"
log "[sub.build] api:$API, API_FLAG was $API_FLAG"
log "[init.project] remote $ARGS"
log "[init.project] path webclient $WEBCLIENT_DIR";
log "[init.project] current path $(pwd)";

ls -lh

function checkEnv {
    if [ "$1" = 'pm-settings' ] &&  [ -z "$PM_SETTINGS_GIT" ]; then
        echo '[env] Missing variable PM_SETTINGS_GIT inside your env';
        exit 1;
    fi;

    if [ "$1" = 'contacts' ] &&  [ -z "$CONTACTS_GIT" ]; then
        echo '[env] Missing variable CONTACTS_GIT inside your env'
        exit 1;
    fi;

    if [ "$1" = 'calendar' ] &&  [ -z "$CALENDAR_GIT" ]; then
        echo '[env] Missing variable CALENDAR_GIT inside your env'
        exit 1;
    fi;
}

function getRemote {
    cd /tmp;
    rm -rf "/tmp/$1" || echo true;
    log "[clone] from $GIT_SUBPROJECT_URL $(pwd)/$1"
    git clone --depth 1 "$GIT_SUBPROJECT_URL" "$1";
}

function loadProject {

    if [ ! -d "/tmp/app-config" ]; then
        git clone --depth 1 "$APP_CONFIG_REPOSITORY" /tmp/app-config
    fi;

    # Check if we need to clone the app because of a remote install
    if [[ "$ARGS" =~ "$1" ]]; then
        IS_REMOTE=true;

        log "[load.project] from remote $2"
        getRemote "$2";
        cd "/tmp/$2";

        log "[config.project] load from /tmp/$2"
        /tmp/app-config/install "/tmp/$2" --verbose
        log "[config.project] loaded"
        return 0;
    fi

    log "[load.project] local $2"
    cd "$ROOT_DIR/$2";
}

##
# Install and build a subproject then copy its bundle to our main app
# Angular. Inside the dist/directory.
# If
function addSubProject {

    # If you deploy from local, we keep your cache
    if [ ! -d "./node_modules/react" ]; then
        npm --no-color i --no-audit --no-package-lock --silent;
    fi

    log "[build.project] npm run bundle -- $MAIN_ARGS --verbose"
    npm --no-color run bundle -- $MAIN_ARGS --no-lint --verbose

    log "[build.project] Remove .htaccess to prevent directory listing";
    rm -rf dist/.htaccess || echo

    log "[build.project] Copy from $(pwd)/dist/ to $WEBCLIENT_DIR/$1";
    cp -r dist/ "$WEBCLIENT_DIR/$1";
}

if [[ "$*" == *--deploy-subproject=settings* ]]; then
    log "[build] settings"
    checkEnv 'pm-settings'
    GIT_SUBPROJECT_URL="$PM_SETTINGS_GIT";
    loadProject "--remote-pm-settings" "${SETTINGS_APP:-proton-mail-settings}";
    addSubProject "$SETTINGS_DIST_DIR";
fi

if [[ "$*" == *--deploy-subproject=contacts* ]]; then
    log "[build] contacts"
    checkEnv 'contacts'
    GIT_SUBPROJECT_URL="$CONTACTS_GIT";
    loadProject "--remote-contacts" "${CONTACTS_APP:-proton-contacts}";
    addSubProject "$CONTACTS_DIST_DIR";
fi

if [[ "$*" == *--deploy-subproject=calendar* ]]; then
    log "[build] calendar"
    checkEnv 'calendar'
    GIT_SUBPROJECT_URL="$CALENDAR_GIT";
    loadProject "--remote-calendar" "${CALENDAR_APP:-proton-calendar}";
    addSubProject "$CALENDAR_DIST_DIR";
fi

echo -e "\n" >> build.log
echo -e "\n" >> build.log
echo "[awk] $(awk --version)" >> build.log
echo -e "\n" >> build.log
