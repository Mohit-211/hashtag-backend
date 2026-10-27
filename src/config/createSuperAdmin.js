const { adminAuthService } = require('../services/Admin');
const config = require('../config/config');
const settings = require('./settings');
const sequelize = require('./central.db');
const { Admin } = require('../models');
const { ACCOUNT_SETUP_HOURS } = require('./accountPolicy');

// npm run auth: creates a Super Admin from SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUP_ADM_ROLE_ID and
// ADM_DEPT_ID in .env, and emails them a "set your password" link. No password is taken from
// .env. The link and the email use the Settings page's admin panel address and mail server, so
// those are loaded first and checked before anything is created.
// Set once the admin row is being written: a failure after that (the email) needs "Forgot password".
let creating = false;

async function createSuperAdmin() {
    const name = String(config.SUPER_ADMIN_NAME || '').trim();
    const email = String(config.SUPER_ADMIN_EMAIL || '').trim();
    if (!name || !email || !config.SUP_ADM_ROLE_ID) {
        console.log('Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and SUP_ADM_ROLE_ID in .env first.');
        return 1;
    }

    await settings.load();
    settings.getRequired('ADMIN_FRONTEND_URL');
    settings.getRequired('SMTP_HOST');

    if (await Admin.isEmailTaken(email)) {
        console.log(`An admin with ${email} already exists. To set a new password, use "Forgot password" on the admin panel's sign-in page.`);
        return 1;
    }

    creating = true;
    await adminAuthService.createAdminUser({
        name,
        email,
        role_id: config.SUP_ADM_ROLE_ID,
        department_id: config.ADM_DEPT_ID,
    });
    console.log(`Super Admin created: ${email}. A "set your password" link was emailed there; it works for ${ACCOUNT_SETUP_HOURS} hours.`);
    return 0;
}

createSuperAdmin()
    .then(async (code) => {
        await sequelize.close();
        process.exit(code);
    })
    .catch(async (error) => {
        console.log(`Super Admin not created: ${error.message}`);
        if (creating) {
            console.log('If the admin exists now but the email failed, use "Forgot password" on the admin panel\'s sign-in page once email works.');
        }
        await sequelize.close();
        process.exit(1);
    });
