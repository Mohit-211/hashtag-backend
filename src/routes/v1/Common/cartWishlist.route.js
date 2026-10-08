const express = require('express');
const router = express.Router();

const {cartWishlistController } = require('../../../controllers');
const {userAuthMiddleware} = require('../../../middlewares');


router.post('/wishlist', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.addToWishlist);
router.get('/wishlist/get', [userAuthMiddleware.verifyAuthJWTToken],cartWishlistController.getWishlist);
router.delete('/wishlist/:id', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.removeFromWishlist);
router.post('/wishlist/move', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.moveWishlistToCart);

router.post('/cart', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.addToCart);
router.get('/cart/get', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.getCart);
router.put('/cart', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.updateCartQuantity);
router.put('/cart/increment', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.incrementCart);
router.put('/cart/decrement', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.decrementCart);
router.delete('/cart/:id', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.removeFromCart);
router.post('/cart/move', [userAuthMiddleware.verifyAuthJWTToken], cartWishlistController.moveCartToWishlist);



module.exports = router;