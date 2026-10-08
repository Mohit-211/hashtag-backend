const { adminAuthService } = require('../services/Admin');
const config = require('../config/config');

async function createSuperAdmin(){
    const adminObj = {
        name : config.SUPER_ADMIN_NAME,
        email : config.SUPER_ADMIN_EMAIL,
        password : config.SUPER_ADMIN_PASSWORD,
        role_id : config.SUP_ADM_ROLE_ID,
        department_id : config.ADM_DEPT_ID
    };
    try{
        await adminAuthService.createAdminUser(adminObj);
        console.log('Super Admin Login Credential : ', `Email : ${config.SUPER_ADMIN_EMAIL}, Password : ${config.SUPER_ADMIN_PASSWORD}`);
    }catch(error){
        console.log('Error : Super Admin Creation Failed');
        return;
    };
};

/* Create Super Admin */
createSuperAdmin();