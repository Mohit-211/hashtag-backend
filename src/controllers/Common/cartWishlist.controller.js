const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { cartWishlistService } = require("../../services");

const addToWishlist = catchAsync(async (req, res) => {
    const product = await cartWishlistService.addToWishlist(req.body);
    return responseWrapper(res, product, "Product Added to Wishlist Successfully", httpStatus.CREATED);
});

const removeFromWishlist = catchAsync(async (req, res) => {
    const product = await cartWishlistService.removeFromWishlist(req.body.user, req.params.id);
    return responseWrapper(res, product, "Product Removed from Wishlist Successfully", httpStatus.CREATED);
});

const getWishlist = catchAsync(async (req, res) => {
    const products = await cartWishlistService.getWishlist(req.body);
    return responseWrapper(res, products, "", httpStatus.OK);
});

const moveWishlistToCart = catchAsync(async (req, res) => {
    const updatedCartItem = await cartWishlistService.moveWishlistToCart(req.body);
    return responseWrapper(res, updatedCartItem, "Item moved to cart successfully", httpStatus.OK);
});

// Cart Controllers

const addToCart = catchAsync(async (req, res) => {
    const cartItem = await cartWishlistService.addToCart(req.body,req.files);
    return responseWrapper(res, cartItem, "Product Added to Cart Successfully", httpStatus.CREATED);
});

const getCart = catchAsync(async (req, res) => {
    const cartItems = await cartWishlistService.getCart(req.body);
    return responseWrapper(res, cartItems, "", httpStatus.OK);
});

const updateCartQuantity = catchAsync(async (req, res) => {
    const updatedCartItem = await cartWishlistService.updateCartQuantity(req.body);
    return responseWrapper(res, updatedCartItem, "Cart Quantity Updated Successfully", httpStatus.OK);
});


const incrementCart = catchAsync(async (req, res) => {
    const updatedCartItem = await cartWishlistService.incrementCart(req.body);
    return responseWrapper(res, updatedCartItem, "Cart Quantity Incremented Successfully", httpStatus.OK);
});

const decrementCart = catchAsync(async (req, res) => {
    const updatedCartItem = await cartWishlistService.decrementCart(req.body);
    return responseWrapper(res, updatedCartItem, "Cart Quantity Decremented Successfully", httpStatus.OK);
});

const removeFromCart = catchAsync(async (req, res) => {
    await cartWishlistService.removeFromCart(req.body.user, req.params.id);
    return responseWrapper(res, "", "Product Removed from Cart Successfully", httpStatus.OK);
});

const moveCartToWishlist = catchAsync(async (req, res) => {
    const updatedCartItem = await cartWishlistService.moveCartToWishlist(req.body);
    return responseWrapper(res, updatedCartItem, "Item moved to wishlist successfully", httpStatus.OK);
});

module.exports = {
    addToWishlist,
    removeFromWishlist,
    getWishlist,
    moveWishlistToCart,
    addToCart,
    getCart,
    updateCartQuantity,
    incrementCart,
	decrementCart,
    removeFromCart,
    moveCartToWishlist
}